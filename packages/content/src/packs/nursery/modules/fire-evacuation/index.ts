// The client-owned sample module "Fire evacuation at Little Acorns" (build pack 2.4). It is not part of nurseryModules:
// the seed builds it as the client's own module. All site details are fictional. Draft content, see module.json.
import { moduleSchema, type Module } from '@sta/domain';
import { parseLesson } from '../../../lessonParser';
import json from './module.json';
import lesson1 from './lesson-1.md?raw';
import lesson2 from './lesson-2.md?raw';
import lesson3 from './lesson-3.md?raw';

export function buildFireEvacuationModule(input: { id: string; clientId: string; siteId?: string }): Module {
  const { lessons, ...rest } = json; // moduleSchema drops the unknown `verify` note
  const files = [lesson1, lesson2, lesson3];
  return moduleSchema.parse({
    ...rest,
    id: input.id,
    owner: input.siteId ? { clientId: input.clientId, siteId: input.siteId } : { clientId: input.clientId },
    requirementIds: [],
    lessons: lessons.map((l, i) => ({ ...l, blocks: parseLesson(files[i] ?? '') })),
  });
}
