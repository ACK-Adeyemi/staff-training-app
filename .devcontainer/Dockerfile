# syntax=docker/dockerfile:1
#
# Dev container for this app: the toolchain plus Claude Code.
# Built and started by scripts/agent. Trim or extend it once the app's stack is chosen.

FROM node:25

ARG CLAUDE_CODE_VERSION=latest
ENV DEBIAN_FRONTEND=noninteractive

# The VM's proxy only allows HTTPS, so point Debian's package sources at https.
RUN set -eux; \
    for f in /etc/apt/sources.list.d/*.sources /etc/apt/sources.list; do \
      if [ -f "$f" ]; then sed -i 's#http://deb.debian.org#https://deb.debian.org#g' "$f"; fi; \
    done; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      git ripgrep jq less procps postgresql-client \
      python3 python3-venv python3-pip; \
    rm -rf /var/lib/apt/lists/*

# Dependency vulnerability scanner for Python projects (npm has `npm audit` built in).
RUN python3 -m pip install --break-system-packages --no-cache-dir pip-audit

# Claude Code. Pin a version with --build-arg CLAUDE_CODE_VERSION=x.y.z if you want repeatable builds.
RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" && npm cache clean --force

# Wrapper that reads the subscription token from the mounted secret, then starts Claude Code.
COPY --chmod=755 claude-agent /usr/local/bin/claude-agent

# Commits made in here are clearly labelled as the agent's.
RUN git config --system user.name "Claude Agent" \
 && git config --system user.email "agent@agent-vm.local" \
 && git config --system init.defaultBranch main

WORKDIR /workspace
CMD ["sleep", "infinity"]
