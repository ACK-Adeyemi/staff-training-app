#!/usr/bin/env python3
"""Split docs/brief.md and docs/build-pack.md into one file per section, plus an index.

Agents start every session and subagent with a fresh context. Reading a focused section file
costs far less than reading most of a 60,000-token document to find one section. The single-file
originals stay the source of truth; re-run this script whenever they change:

    python3 scripts/split-docs.py

Rules: split at "## " headings outside code fences. A section longer than SPLIT_LINES lines that
has "### " subsections is split again into one file per subsection, each starting with a
breadcrumb naming its parent section.
"""
import re
import sys
from pathlib import Path

SPLIT_LINES = 120
DOCS = Path(__file__).resolve().parent.parent / "docs"
SOURCES = [("brief.md", "brief", "Product brief"), ("build-pack.md", "build-pack", "Build pack")]


def slug(text, limit=48):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return (s[:limit].rstrip("-")) or "section"


def split_on(lines, level):
    """Split lines at headings of the given level ("## " or "### "), ignoring code fences.
    Returns (preamble, [(heading, lines_including_heading), ...])."""
    marker = "#" * level + " "
    preamble, parts, current, in_fence = [], [], None, False
    for line in lines:
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
        if not in_fence and line.startswith(marker):
            current = (line[len(marker):].strip(), [line])
            parts.append(current)
        elif current is None:
            preamble.append(line)
        else:
            current[1].append(line)
    return preamble, parts


def section_number(heading):
    m = re.match(r"(\d+)\.?\s", heading)
    return m.group(1) if m else None


def subheadings(lines):
    out, in_fence = [], False
    for i, line in enumerate(lines, 1):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
        if not in_fence and line.startswith("### "):
            out.append((line[4:].strip(), i))
    return out


def write(path, lines):
    path.write_text("".join(lines), encoding="utf-8")


def process(src_name, out_name, title):
    src = DOCS / src_name
    if not src.exists():
        sys.exit(f"Missing {src}")
    lines = src.read_text(encoding="utf-8").splitlines(keepends=True)
    out = DOCS / out_name
    out.mkdir(exist_ok=True)
    for old in out.glob("*.md"):
        old.unlink()

    preamble, sections = split_on(lines, 2)
    index = [f"# {title}: section index\n\n",
             f"Generated from docs/{src_name} by scripts/split-docs.py. Read-only: the user owns "
             f"the source document, and these files are regenerated from it.\n\n",
             f"A reference like \"{'brief' if out_name == 'brief' else 'section'} 13.4\" means "
             f"section 13, subsection 13.4: find it below.\n\n",
             "| Section | File | Lines | Subsections (line in file) |\n|---|---|---|---|\n"]

    def add(name, heading, body):
        write(out / name, body)
        subs = "; ".join(f"{h} ({n})" for h, n in subheadings(body)) or ""
        index.append(f"| {heading} | {name} | {len(body)} | {subs} |\n")

    add("00-overview.md", "Introduction (before section 1)", preamble)
    for pos, (heading, body) in enumerate(sections, 1):
        num = section_number(heading) or f"x{pos:02d}"
        base = f"{int(num):02d}" if num.isdigit() else num
        head_text = re.sub(r"^\d+\.?\s*", "", heading)
        _, subs = split_on(body, 3)
        if len(body) > SPLIT_LINES and subs:
            intro, parts = split_on(body, 3)
            add(f"{base}-00-{slug(head_text)}.md", heading, intro)
            for i, (sub_heading, sub_body) in enumerate(parts, 1):
                crumb = [f"<!-- {title}, section {heading} -->\n", f"## {heading} (continued)\n\n"]
                sub_text = re.sub(r"^[0-9.]+[.]?\s*", "", sub_heading)
                add(f"{base}-{i:02d}-{slug(sub_text)}.md", f"{heading} > {sub_heading}", crumb + sub_body)
        else:
            add(f"{base}-{slug(head_text)}.md", heading, body)

    write(out / "README.md", index)
    count = len(list(out.glob("*.md"))) - 1
    print(f"docs/{src_name}: {len(lines)} lines -> docs/{out_name}/ ({count} files + README.md)")


if __name__ == "__main__":
    for args in SOURCES:
        process(*args)
