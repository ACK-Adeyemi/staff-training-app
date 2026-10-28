import { describe, expect, it } from 'vitest';
import { explainLesson, usageCapReached } from './demoAi';

describe('explainLesson', () => {
  it('uses key points and ignores text when there are some', () => {
    const text = explainLesson({
      blocks: [
        { kind: 'text', markdown: 'Ignore this. Really.' },
        { kind: 'keyPoints', items: ['One.', 'Two.'] },
      ],
    });
    expect(text).toBe('One.\nTwo.');
  });
  it('falls back to the first sentence of each text block, without markdown marks', () => {
    const text = explainLesson({
      blocks: [
        { kind: 'text', markdown: '## **Exits** stay clear. Check daily.' },
        { kind: 'text', markdown: 'Keep the log' },
      ],
    });
    expect(text).toBe('Exits stay clear.\nKeep the log');
  });
});

describe('usageCapReached', () => {
  const pricing = { includedUnits: 200, pricePerUnit: 5 };
  it('never stops inside the included units, even with a cap of 0', () => {
    expect(usageCapReached(199, pricing, 0)).toBe(false);
  });
  it('stops when the next unit would pass the cap', () => {
    expect(usageCapReached(200, pricing, 5)).toBe(false);
    expect(usageCapReached(201, pricing, 5)).toBe(true);
  });
  it('has no limit without a cap', () => {
    expect(usageCapReached(10_000, pricing, undefined)).toBe(false);
  });
});
