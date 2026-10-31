// M5 chunk 3 (F-1; plan Assumptions, conflict 1; build pack 9.3 and 07-04): seed version 9 adds the client draft module
// "Mobile phone policy" for Little Acorns only. "Lone working at the end of the day" stays.
import { describe, expect, it } from 'vitest';
import { moduleSchema, type Module } from '@sta/domain';
import { SEED_VERSION } from './index';
import { seeded } from './testing';

const PHONE_TITLE = 'Mobile phone policy';
const LONE_TITLE = 'Lone working at the end of the day';

describe('seed version 9 (M5 chunk 3)', () => {
  it('is bumped to 9 so stored worlds reseed', () => {
    expect(SEED_VERSION).toBe(9);
  });

  it('has exactly one "Mobile phone policy" module, a valid draft owned by Little Acorns', async () => {
    const { dump, keys } = await seeded();
    const la = keys.clients['littleAcorns']!;
    const found = (dump['modules'] as Module[]).filter((m) => m.title === PHONE_TITLE);
    expect(found).toHaveLength(1);
    const phone = found[0]!;
    expect(moduleSchema.safeParse(phone).success).toBe(true);
    expect(phone.status).toBe('draft');
    expect(phone.version).toBe(1);
    expect(phone.owner).toEqual({ clientId: la });
    expect(phone.lessons.length).toBeGreaterThanOrEqual(1);
    expect(phone.questions.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the Lone working draft and gives no other client an own module', async () => {
    const { dump, keys } = await seeded();
    const la = keys.clients['littleAcorns']!;
    const own = (dump['modules'] as Module[]).filter((m) => m.owner !== 'provider');
    expect(own.every((m) => (m.owner as { clientId: string }).clientId === la)).toBe(true);
    expect(own.map((m) => m.title)).toEqual(expect.arrayContaining([LONE_TITLE, PHONE_TITLE]));
    expect(own.find((m) => m.title === LONE_TITLE)!.status).toBe('draft');
  });

  it('keeps the draft hidden from staff: not published, never assigned, grouped or placed', async () => {
    const { dump } = await seeded();
    const phone = (dump['modules'] as Module[]).find((m) => m.title === PHONE_TITLE)!;
    expect(phone).toBeDefined();
    expect(phone.status).not.toBe('published');
    const refersTo = (rec: unknown): boolean => JSON.stringify(rec).includes(phone.id);
    for (const store of [
      'assignments',
      'modulePlacements',
      'moduleGroups',
      'attempts',
      'learningEvents',
      'moduleVersions',
    ]) {
      expect((dump[store] ?? []).filter(refersTo), store).toHaveLength(0);
    }
  });
});
