// Test-only builders for the catalogue and notes tests (M2 chunk 4). Plain data, no behaviour.
import type { Category, ModuleGroup, ModulePlacement } from '../schemas/engagement';
import { CLIENT, nextId } from '../progress/testFixtures';

export { CLIENT, nextId };
export {
  AMBER,
  NOW,
  SITE_ID,
  assignment,
  evidenceExpiring,
  moduleFor,
  person,
  requirement,
  site,
} from '../progress/testFixtures';

let order = 0;
export const category = (name: string, over: Partial<Category> = {}): Category => ({
  id: nextId(),
  clientId: CLIENT,
  name,
  colour: 'green',
  icon: 'book',
  order: order++,
  ...over,
});

export const placement = (moduleId: string, over: Partial<ModulePlacement> = {}): ModulePlacement => ({
  clientId: CLIENT,
  moduleId,
  availableToAll: false,
  ...over,
});

export const group = (name: string, moduleIds: string[], over: Partial<ModuleGroup> = {}): ModuleGroup => ({
  id: nextId(),
  clientId: CLIENT,
  name,
  description: '',
  moduleIds,
  inOrder: false,
  ...over,
});
