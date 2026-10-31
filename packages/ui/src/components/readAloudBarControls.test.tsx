// M5 chunk 8 (F-6, BP-4): ReadAloudBar controls-only mode, pause and resume, bounds, speed.
// Written before the implementation. Assumed props added to ReadAloudBarProps (all optional):
//   controlsOnly?: boolean            true: render only the controls, never the paragraph text (the lesson shows it itself).
//   onIndexChange?: (i: number) => void   called whenever the current paragraph changes (Previous, Next, auto-advance).
//   defaultRate?: number              the starting speed (the app passes prefs.readAloudRate); must be one of `rates`.
// Pause stops speech; Play afterwards restarts at the start of the current paragraph (plan assumption 16).
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadAloudBar, type ReadAloudBarProps } from './ReadAloudBar';

afterEach(cleanup);

const paragraphs = ['First paragraph.', 'Second paragraph.', 'Third paragraph.'];
const labels = {
  play: 'Read aloud',
  pause: 'Pause',
  speed: 'Reading speed',
  previous: 'Previous paragraph',
  next: 'Next paragraph',
};

function fakeSpeech() {
  const calls: { text: string; rate: number; onEnd: () => void }[] = [];
  return {
    calls,
    speak: vi.fn((text: string, opts: { rate: number; onEnd: () => void }) => {
      calls.push({ text, rate: opts.rate, onEnd: opts.onEnd });
    }),
    stop: vi.fn(),
  };
}
const setup = (extra: Partial<ReadAloudBarProps> = {}) => {
  const speech = fakeSpeech();
  const user = userEvent.setup();
  render(
    <ReadAloudBar
      paragraphs={paragraphs}
      speech={speech}
      labels={labels}
      rates={[0.75, 1, 1.25, 1.5]}
      controlsOnly
      {...extra}
    />,
  );
  return { speech, user };
};
const press = (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(screen.getByRole('button', { name }));

describe('ReadAloudBar controls-only mode', () => {
  it('renders the controls but none of the paragraph text', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Previous paragraph' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Read aloud' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next paragraph' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Reading speed' })).toBeTruthy();
    for (const p of paragraphs) expect(screen.queryByText(p)).toBeNull();
    expect(document.querySelector('[aria-current]')).toBeNull();
  });

  it('still renders the paragraphs when controlsOnly is off', () => {
    setup({ controlsOnly: false });
    for (const p of paragraphs) expect(screen.getByText(p)).toBeTruthy();
  });

  it('still speaks the paragraph text in controls-only mode', async () => {
    const { speech, user } = setup();
    await press(user, 'Read aloud');
    expect(speech.calls.map((c) => c.text)).toEqual(['First paragraph.']);
  });
});

describe('ReadAloudBar pause and resume', () => {
  it('Pause stops speech and the button goes back to Play', async () => {
    const { speech, user } = setup();
    await press(user, 'Read aloud');
    expect(screen.queryByRole('button', { name: 'Read aloud' })).toBeNull();
    await press(user, 'Pause');
    expect(speech.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Read aloud' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });

  it('resume restarts at the start of the current paragraph, not the first one', async () => {
    const { speech, user } = setup();
    await press(user, 'Read aloud');
    speech.calls[0]!.onEnd(); // paragraph 1 finished, so paragraph 2 is now being read
    await vi.waitFor(() => {
      expect(speech.calls).toHaveLength(2);
    });
    await press(user, 'Pause');
    await press(user, 'Read aloud');
    expect(speech.calls).toHaveLength(3);
    expect(speech.calls[2]!.text).toBe('Second paragraph.');
  });

  it('a paragraph that ends after Pause does not start the next one', async () => {
    const { speech, user } = setup();
    await press(user, 'Read aloud');
    const first = speech.calls[0]!;
    await press(user, 'Pause');
    first.onEnd();
    expect(speech.calls).toHaveLength(1);
  });

  it('reports the current paragraph index as it changes', async () => {
    const seen: number[] = [];
    const { speech, user } = setup({ onIndexChange: (i: number) => seen.push(i) });
    await press(user, 'Read aloud');
    speech.calls[0]!.onEnd();
    await vi.waitFor(() => {
      expect(seen.at(-1)).toBe(1);
    });
    await press(user, 'Previous paragraph');
    expect(seen.at(-1)).toBe(0);
  });
});

describe('ReadAloudBar previous and next', () => {
  it('disables Previous on the first paragraph and Next on the last', async () => {
    const { user } = setup();
    const prev = screen.getByRole('button', { name: 'Previous paragraph' });
    const next = screen.getByRole('button', { name: 'Next paragraph' });
    expect((prev as HTMLButtonElement).disabled).toBe(true);
    expect((next as HTMLButtonElement).disabled).toBe(false);
    await user.click(next);
    await user.click(next);
    expect((next as HTMLButtonElement).disabled).toBe(true);
    expect((prev as HTMLButtonElement).disabled).toBe(false);
  });

  it('while reading, Next speaks the next paragraph and Previous goes back', async () => {
    const { speech, user } = setup();
    await press(user, 'Read aloud');
    await press(user, 'Next paragraph');
    expect(speech.calls.at(-1)!.text).toBe('Second paragraph.');
    await press(user, 'Previous paragraph');
    expect(speech.calls.at(-1)!.text).toBe('First paragraph.');
  });

  it('while paused, Next only moves the position: nothing is spoken until Play', async () => {
    const seen: number[] = [];
    const { speech, user } = setup({ onIndexChange: (i: number) => seen.push(i) });
    await press(user, 'Next paragraph');
    expect(speech.speak).not.toHaveBeenCalled();
    expect(seen.at(-1)).toBe(1);
    await press(user, 'Read aloud');
    expect(speech.calls[0]!.text).toBe('Second paragraph.');
  });

  it('does not run past the last paragraph: reading ends and Play is offered again', async () => {
    const { speech, user } = setup({ paragraphs: ['Only one.'] });
    await press(user, 'Read aloud');
    speech.calls[0]!.onEnd();
    expect(await screen.findByRole('button', { name: 'Read aloud' })).toBeTruthy();
    expect(speech.calls).toHaveLength(1);
  });
});

describe('ReadAloudBar speed', () => {
  it('starts at defaultRate and speaks at that rate', async () => {
    const { speech, user } = setup({ defaultRate: 1.25 });
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Reading speed' }).value).toBe('1.25');
    await press(user, 'Read aloud');
    expect(speech.calls[0]!.rate).toBe(1.25);
  });

  it('changing speed while reading restarts the current paragraph at the new rate', async () => {
    const { speech, user } = setup();
    await press(user, 'Read aloud');
    await press(user, 'Next paragraph');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Reading speed' }), '1.5');
    const last = speech.calls.at(-1)!;
    expect(last.text).toBe('Second paragraph.');
    expect(last.rate).toBe(1.5);
  });

  it('changing speed while paused speaks nothing, and Play uses the new rate', async () => {
    const { speech, user } = setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Reading speed' }), '0.75');
    expect(speech.speak).not.toHaveBeenCalled();
    await press(user, 'Read aloud');
    expect(speech.calls[0]!.rate).toBe(0.75);
  });
});
