// The nursery provider modules. Each module is a folder with module.json (settings and question bank) and one Markdown
// file per lesson; lessons are parsed here so the Markdown stays the single source of lesson text.
import { moduleSchema, type Module } from '@sta/domain';
import { contentId } from '../../contentId';
import { moduleIds } from '../../moduleIds';
import { parseLesson } from '../../lessonParser';
import safeguardingJson from './safeguarding/module.json';
import safeguardingLesson1 from './safeguarding/lesson-1.md?raw';
import safeguardingLesson2 from './safeguarding/lesson-2.md?raw';
import safeguardingLesson3 from './safeguarding/lesson-3.md?raw';
import safeguardingLesson4 from './safeguarding/lesson-4.md?raw';

const lessonFiles = [safeguardingLesson1, safeguardingLesson2, safeguardingLesson3, safeguardingLesson4];

const build = (json: typeof safeguardingJson, files: string[], id: string, requirementIds: string[]): Module => {
  const { lessons, ...rest } = json; // moduleSchema drops the unknown `verify` note
  return moduleSchema.parse({
    ...rest,
    id,
    owner: 'provider',
    requirementIds,
    lessons: lessons.map((l, i) => ({ ...l, blocks: parseLesson(files[i] ?? '') })),
  });
};

// The Safeguarding requirement is contentId(601) in the nursery pack.
export const nurseryModules: Module[] = [
  build(safeguardingJson, lessonFiles, moduleIds.safeguardingAndWhistleblowing, [contentId(601)]),
];
