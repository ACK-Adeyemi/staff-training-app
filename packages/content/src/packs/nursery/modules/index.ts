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
import pfaJson from './paediatric-first-aid/module.json';
import pfaLesson1 from './paediatric-first-aid/lesson-1.md?raw';
import pfaLesson2 from './paediatric-first-aid/lesson-2.md?raw';
import eatingJson from './safer-eating/module.json';
import eatingLesson1 from './safer-eating/lesson-1.md?raw';
import eatingLesson2 from './safer-eating/lesson-2.md?raw';
import eatingLesson3 from './safer-eating/lesson-3.md?raw';

const lessonFiles = [safeguardingLesson1, safeguardingLesson2, safeguardingLesson3, safeguardingLesson4];

interface ModuleJson {
  lessons: { id: string; title: string; minutes: number }[];
}

const build = (json: ModuleJson, files: string[], id: string, requirementIds: string[]): Module => {
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
  // The paediatric first aid requirement is contentId(602). Safer eating is optional, with no requirement link.
  build(pfaJson, [pfaLesson1, pfaLesson2], moduleIds.paediatricFirstAid, [contentId(602)]),
  build(eatingJson, [eatingLesson1, eatingLesson2, eatingLesson3], moduleIds.safeEatingAllergiesAndChoking, []),
];
