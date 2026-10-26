// F-4: organising categories and groups with buttons (brief 17.1; plan M2 assumption 26).
import { describe, expect, it } from 'vitest';
import { planCategoryDelete, planMerge, reorder } from './organise';
import { category, nextId, placement } from './testFixtures';

const items = ['a', 'b', 'c'].map((id) => ({ id }));
const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe('reorder', () => {
  it('moves an item up and down by one place', () => {
    expect(ids(reorder(items, 'b', 'up'))).toEqual(['b', 'a', 'c']);
    expect(ids(reorder(items, 'b', 'down'))).toEqual(['a', 'c', 'b']);
  });

  it('leaves the order unchanged moving the first up or the last down', () => {
    expect(ids(reorder(items, 'a', 'up'))).toEqual(['a', 'b', 'c']);
    expect(ids(reorder(items, 'c', 'down'))).toEqual(['a', 'b', 'c']);
  });

  it('leaves the order unchanged for an unknown id', () => {
    expect(ids(reorder(items, 'zzz', 'up'))).toEqual(['a', 'b', 'c']);
  });

  it('works for a single item list', () => {
    expect(ids(reorder([{ id: 'a' }], 'a', 'down'))).toEqual(['a']);
  });

  it('returns a new array and does not mutate the input', () => {
    const out = reorder(items, 'b', 'up');
    expect(out).not.toBe(items);
    expect(ids(items)).toEqual(['a', 'b', 'c']);
  });
});

describe('planCategoryDelete', () => {
  const doomed = category('Old');
  const target = category('New');
  const other = category('Other');
  const m1 = nextId();
  const m2 = nextId();
  const m3 = nextId();
  const placements = [
    placement(m1, { categoryId: doomed.id, availableToAll: true }),
    placement(m2, { categoryId: doomed.id }),
    placement(m3, { categoryId: other.id }),
  ];

  it('moves every module of the deleted category to the chosen one in one batch', () => {
    const plan = planCategoryDelete(doomed.id, target.id, placements);
    expect(plan.deleteCategoryId).toBe(doomed.id);
    expect(plan.updates.map((p) => p.moduleId).sort()).toEqual([m1, m2].sort());
    expect(plan.updates.every((p) => p.categoryId === target.id)).toBe(true);
  });

  it('keeps availableToAll and the other placement fields', () => {
    const plan = planCategoryDelete(doomed.id, target.id, placements);
    expect(plan.updates.find((p) => p.moduleId === m1)?.availableToAll).toBe(true);
    expect(plan.updates.find((p) => p.moduleId === m2)?.availableToAll).toBe(false);
  });

  it('moving to nothing leaves the modules uncategorised', () => {
    const plan = planCategoryDelete(doomed.id, undefined, placements);
    expect(plan.updates).toHaveLength(2);
    expect(plan.updates.every((p) => p.categoryId === undefined)).toBe(true);
  });

  it('does not touch placements of other categories and does not mutate input', () => {
    const plan = planCategoryDelete(doomed.id, target.id, placements);
    expect(plan.updates.some((p) => p.moduleId === m3)).toBe(false);
    expect(placements[0]?.categoryId).toBe(doomed.id);
  });

  it('refuses to move modules into the category being deleted', () => {
    expect(() => planCategoryDelete(doomed.id, doomed.id, placements)).toThrow();
  });

  it('plans no updates for an empty category', () => {
    expect(planCategoryDelete(target.id, doomed.id, placements).updates).toEqual([]);
  });
});

describe('planMerge', () => {
  const source = category('Source');
  const target = category('Target');
  const m1 = nextId();
  const m2 = nextId();
  const placements = [placement(m1, { categoryId: source.id }), placement(m2, { categoryId: target.id })];

  it('moves the source modules into the target and removes the source category', () => {
    const plan = planMerge(source.id, target.id, placements);
    expect(plan.deleteCategoryId).toBe(source.id);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({ moduleId: m1, categoryId: target.id });
  });

  it('refuses to merge a category into itself', () => {
    expect(() => planMerge(source.id, source.id, placements)).toThrow();
  });
});
