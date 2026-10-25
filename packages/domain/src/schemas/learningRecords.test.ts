// Plan Chunk 2: the record schemas around learning (overlay, attachment, assignment, event, attempt, notification).
import { describe, expect, it } from 'vitest';
import {
  assignmentSchema,
  attachmentSchema,
  attemptSchema,
  clientLinkOverlaySchema,
  learningEventSchema,
  notificationSchema,
} from './learning';

const id = (n: number): string => `01HZX00000000000000000${String(n).padStart(4, '0')}`;
const at = '2026-10-19T09:00:00Z';

describe('learning record schemas', () => {
  it('accepts a valid assignment and refuses a bad status', () => {
    const a = {
      id: id(1),
      clientId: id(2),
      personId: id(3),
      target: { moduleId: id(4) },
      dueAt: at,
      source: 'manual',
      assignedBy: id(5),
      createdAt: at,
      status: 'open',
    };
    expect(assignmentSchema.safeParse(a).success).toBe(true);
    expect(assignmentSchema.safeParse({ ...a, status: 'late' }).success).toBe(false);
  });

  it('accepts an attachment only as markdown', () => {
    const a = { id: id(1), clientId: id(2), title: 'Policy', mime: 'text/markdown', body: '# Hi', createdAt: at };
    expect(attachmentSchema.safeParse(a).success).toBe(true);
    expect(attachmentSchema.safeParse({ ...a, mime: 'text/html' }).success).toBe(false);
  });

  it('accepts an overlay and requires clientId', () => {
    const o = { id: id(1), clientId: id(2), moduleId: id(3), links: [], addedBy: id(4), addedAt: at };
    expect(clientLinkOverlaySchema.safeParse(o).success).toBe(true);
    const { clientId: _c, ...bad } = o;
    expect(clientLinkOverlaySchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a learnMoreOpened event with a link id and refuses an unknown type', () => {
    const e = {
      id: id(1),
      clientId: id(2),
      siteId: id(3),
      personId: id(4),
      at,
      type: 'learnMoreOpened',
      linkId: 'eyfs-3-4',
    };
    expect(learningEventSchema.safeParse(e).success).toBe(true);
    expect(learningEventSchema.safeParse({ ...e, type: 'other' }).success).toBe(false);
  });

  it('accepts an attempt with option order and refuses a score above 100', () => {
    const a = {
      id: id(1),
      clientId: id(2),
      siteId: id(3),
      personId: id(4),
      moduleId: id(5),
      moduleVersion: 1,
      mode: 'open',
      questionIds: ['q1'],
      optionOrder: { q1: ['q1-o1', 'q1-o0'] },
      startedAt: at,
    };
    expect(attemptSchema.safeParse(a).success).toBe(true);
    expect(attemptSchema.safeParse({ ...a, score: 101 }).success).toBe(false);
  });

  it('stores a notification as kind plus params with a clientId', () => {
    const n = {
      id: id(1),
      clientId: id(2),
      userId: id(3),
      kind: 'trainingAssigned',
      params: { moduleTitle: 'Safeguarding', dueDate: '2026-11-02' },
      createdAt: at,
    };
    expect(notificationSchema.safeParse(n).success).toBe(true);
    expect(notificationSchema.safeParse({ ...n, params: { x: {} } }).success).toBe(false);
  });
});
