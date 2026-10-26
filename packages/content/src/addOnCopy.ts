// What each add-on does and an example, for the add-on cards. Text lives in en-GB.json under addOns.copy. Prices come from
// the add-on records, never from here.
import { addOnIds } from './packages';

export interface AddOnCopy {
  whatKey: string;
  exampleKey: string;
}

const copy = (name: string): AddOnCopy => ({
  whatKey: `addOns.copy.${name}.what`,
  exampleKey: `addOns.copy.${name}.example`,
});

export const addOnCopy: Record<string, AddOnCopy> = {
  [addOnIds.aiAssistant]: copy('aiAssistant'),
  [addOnIds.translation]: copy('translation'),
  [addOnIds.reminders]: copy('reminders'),
  [addOnIds.extraContentPack]: copy('extraContentPack'),
  [addOnIds.onboarding]: copy('onboarding'),
};
