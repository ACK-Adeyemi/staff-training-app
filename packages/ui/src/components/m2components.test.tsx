// M2 chunk 11: Sheet, Switch, SegmentedControl, Chip, SearchField, Highlight, BarChart, LineChart,
// LevelBar, GoalRing, BadgeTile, CourseChip, LeaderboardList, Celebration, ReadAloudBar.
// All user-facing words arrive through props; the tests pass their own labels.
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BadgeTile,
  BarChart,
  Celebration,
  Chip,
  CourseChip,
  GoalRing,
  Highlight,
  LeaderboardList,
  LevelBar,
  LineChart,
  ReadAloudBar,
  SearchField,
  SegmentedControl,
  Sheet,
  Switch,
} from '../index';

afterEach(cleanup);

describe('Sheet', () => {
  function Host({ onClose = () => {} }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button
          onClick={() => {
            setOpen(true);
          }}
        >
          Open notes
        </button>
        <Sheet
          open={open}
          title="Add note"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <button>Save note</button>
        </Sheet>
      </>
    );
  }

  it('shows a labelled dialog with a heading and its content when open', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Open notes' }));
    const dlg = screen.getByRole('dialog', { name: 'Add note' });
    expect(within(dlg).getByRole('heading', { name: 'Add note' })).toBeTruthy();
    expect(within(dlg).getByRole('button', { name: 'Save note' })).toBeTruthy();
  });

  it('moves focus inside on open, closes on Escape and returns focus to the opener', async () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Open notes' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });

  it('renders nothing visible as a dialog when closed', () => {
    render(
      <Sheet open={false} title="Hidden" onClose={() => {}}>
        <p>Inside</p>
      </Sheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Switch', () => {
  function Host({ initial = false }: { initial?: boolean }) {
    const [on, setOn] = useState(initial);
    return <Switch label="Sound effects" checked={on} onChange={setOn} onLabel="On" offLabel="Off" />;
  }

  it('has role switch named by its label, with aria-checked and a visible state word', () => {
    render(<Host />);
    const sw = screen.getByRole('switch', { name: 'Sound effects' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Off')).toBeTruthy();
  });

  it('toggles with click, Space and Enter and updates the state word', async () => {
    render(<Host />);
    const sw = screen.getByRole('switch', { name: 'Sound effects' });
    await userEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('On')).toBeTruthy();
    sw.focus();
    await userEvent.keyboard(' ');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await userEvent.keyboard('{Enter}');
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('can be disabled and then ignores clicks', async () => {
    const onChange = vi.fn();
    render(<Switch label="Closed book" checked={false} onChange={onChange} onLabel="On" offLabel="Off" disabled />);
    await userEvent.click(screen.getByRole('switch', { name: 'Closed book' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLButtonElement>('switch').disabled).toBe(true);
  });

  it('has a touch target of at least 44px', () => {
    render(<Host />);
    expect(screen.getByRole('switch').className).toMatch(/min-h-\[?(44px|11)|min-h-11|h-11/);
  });
});

describe('SegmentedControl', () => {
  const options = [
    { value: 'auto', label: 'Auto' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  function Host({ onChange = () => {} }: { onChange?: (v: string) => void }) {
    const [v, setV] = useState('auto');
    return (
      <SegmentedControl
        legend="Colour mode"
        options={options}
        value={v}
        onChange={(n) => {
          onChange(n);
          setV(n);
        }}
      />
    );
  }

  it('is a radio group named by its legend with one checked radio', () => {
    render(<Host />);
    const group = screen.getByRole('radiogroup', { name: 'Colour mode' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).checked)).toEqual([true, false, false]);
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeTruthy();
  });

  it('selects an option on click and reports the value', async () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(onChange).toHaveBeenCalledWith('light');
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Light' }).checked).toBe(true);
  });

  it('moves selection with the arrow keys', async () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    screen.getByRole('radio', { name: 'Auto' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('light');
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('dark');
  });
});

describe('Chip', () => {
  it('shows its label as plain text with no button when it cannot be removed', () => {
    render(<Chip label="Fire safety" />);
    expect(screen.getByText('Fire safety')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('has a remove button named "Remove filter: {label}" that calls onRemove', async () => {
    const onRemove = vi.fn();
    render(<Chip label="Fire safety" onRemove={onRemove} removeLabel="Remove filter: Fire safety" />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Fire safety' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('renders an optional icon and sets the colour token as a data attribute', () => {
    const { container } = render(<Chip label="Safeguarding" icon="alert" colour="cat-3" />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('[data-colour="cat-3"]')).toBeTruthy();
  });
});

describe('SearchField', () => {
  function Host({ start = '' }: { start?: string }) {
    const [v, setV] = useState(start);
    return <SearchField label="Search courses" value={v} onChange={setV} clearLabel="Clear search" />;
  }

  it('is a search input with an accessible name', () => {
    render(<Host />);
    const input = screen.getByRole<HTMLInputElement>('searchbox', { name: 'Search courses' });
    expect(input.type).toBe('search');
  });

  it('reports typing and shows the clear button only when there is text', async () => {
    render(<Host />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    await userEvent.type(screen.getByRole('searchbox'), 'fire');
    expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('fire');
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeTruthy();
  });

  it('clears the text and puts focus back in the field', async () => {
    render(<Host start="fire" />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    const input = screen.getByRole<HTMLInputElement>('searchbox');
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });
});

describe('Highlight', () => {
  it('wraps each match range in a mark element and keeps the rest as plain text', () => {
    const { container } = render(
      <Highlight
        text="Fire safety basics"
        ranges={[
          { start: 0, end: 4 },
          { start: 5, end: 11 },
        ]}
      />,
    );
    const marks = [...container.querySelectorAll('mark')].map((m) => m.textContent);
    expect(marks).toEqual(['Fire', 'safety']);
    expect(container.textContent).toBe('Fire safety basics');
  });

  it('renders the text with no marks when there are no ranges', () => {
    const { container } = render(<Highlight text="Plain" ranges={[]} />);
    expect(container.querySelectorAll('mark').length).toBe(0);
    expect(container.textContent).toBe('Plain');
  });

  it('ignores out of range and overlapping ranges without losing text', () => {
    const { container } = render(
      <Highlight
        text="Hello"
        ranges={[
          { start: 1, end: 3 },
          { start: 2, end: 4 },
          { start: 9, end: 12 },
        ]}
      />,
    );
    expect(container.textContent).toBe('Hello');
  });
});

const chartData = [
  { label: 'Mon', value: 3 },
  { label: 'Tue', value: 5 },
  { label: 'Wed', value: 2 },
];
const chartProps = {
  description: 'Questions answered each day: Mon 3, Tue 5, Wed 2.',
  data: chartData,
  labelHeader: 'Day',
  valueHeader: 'Questions',
  tableCaption: 'Questions answered each day',
  showTableLabel: 'Show as table',
  hideTableLabel: 'Hide table',
};

describe.each([
  ['BarChart', BarChart],
  ['LineChart', LineChart],
])('%s', (_name, Chart) => {
  it('exposes the chart as an image with its description as the name', () => {
    render(<Chart {...chartProps} />);
    expect(screen.getByRole('img', { name: chartProps.description })).toBeTruthy();
  });

  it('hides the data table until the toggle is pressed, then shows every data point', async () => {
    render(<Chart {...chartProps} />);
    expect(screen.queryByRole('table')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Show as table' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(toggle);
    const table = screen.getByRole('table', { name: 'Questions answered each day' });
    expect(within(table).getAllByRole('row').length).toBe(4);
    expect(within(table).getByText('Tue')).toBeTruthy();
    expect(within(table).getByText('5')).toBeTruthy();
    const hide = screen.getByRole('button', { name: 'Hide table' });
    expect(hide.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(hide);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('draws no randomness: two renders give identical markup', () => {
    const a = render(<Chart {...chartProps} />).container.innerHTML;
    cleanup();
    const b = render(<Chart {...chartProps} />).container.innerHTML;
    expect(a).toBe(b);
  });

  it('copes with an empty data set', () => {
    render(<Chart {...chartProps} data={[]} />);
    expect(screen.getByRole('img', { name: chartProps.description })).toBeTruthy();
  });
});

describe('LevelBar', () => {
  it('is a progressbar with numeric values and the caller sentence as its text', () => {
    render(<LevelBar value={120} max={250} label="Level 4, 120 of 250 XP to level 5" />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('120');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('250');
    expect(bar.getAttribute('aria-valuetext')).toBe('Level 4, 120 of 250 XP to level 5');
    expect(screen.getAllByText('Level 4, 120 of 250 XP to level 5').length).toBeGreaterThan(0);
  });

  it('clamps the value into the range', () => {
    render(<LevelBar value={999} max={250} label="Full" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('250');
  });
});

describe('GoalRing', () => {
  it('shows the label and value text and exposes the description', () => {
    render(
      <GoalRing
        label="Weekly goal"
        percent={60}
        valueText="3 of 5"
        description="Weekly goal: 3 of 5 lessons done"
        completeLabel="Goal met"
      />,
    );
    expect(screen.getByText('Weekly goal')).toBeTruthy();
    expect(screen.getByText('3 of 5')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Weekly goal: 3 of 5 lessons done' })).toBeTruthy();
  });

  it('shows the complete word at 100 percent', () => {
    render(
      <GoalRing label="Weekly goal" percent={100} valueText="5 of 5" description="Done" completeLabel="Goal met" />,
    );
    expect(screen.getByText('Goal met')).toBeTruthy();
  });
});

describe('BadgeTile', () => {
  it('shows name and earned date text when earned, and no next goal', () => {
    render(<BadgeTile name="First steps" icon="trophy" earned detail="Earned 3 Mar 2026" stateLabel="Earned" />);
    expect(screen.getByText('First steps')).toBeTruthy();
    expect(screen.getByText('Earned 3 Mar 2026')).toBeTruthy();
    expect(screen.getByText('Earned')).toBeTruthy();
  });

  it('shows the next goal text and a Locked state word (not colour alone) when not earned', () => {
    const { container } = render(
      <BadgeTile
        name="Fire expert"
        icon="trophy"
        earned={false}
        detail="Next goal: pass 3 fire quizzes"
        stateLabel="Locked"
      />,
    );
    expect(screen.getByText('Next goal: pass 3 fire quizzes')).toBeTruthy();
    expect(screen.getByText('Locked')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('[data-earned="false"]')).toBeTruthy();
  });

  it('marks earned tiles with data-earned true', () => {
    const { container } = render(<BadgeTile name="A" icon="check" earned detail="Earned" stateLabel="Earned" />);
    expect(container.querySelector('[data-earned="true"]')).toBeTruthy();
  });
});

describe('CourseChip', () => {
  it('is a link to the course with its name when available', () => {
    render(
      <CourseChip
        name="Fire safety"
        icon="alert"
        colour="cat-2"
        href="#/staff/course/fire"
        unavailableLabel="Course no longer available"
      />,
    );
    const link = screen.getByRole('link', { name: /Fire safety/ });
    expect(link.getAttribute('href')).toBe('#/staff/course/fire');
    expect(screen.queryByText('Course no longer available')).toBeNull();
  });

  it('is plain text with "Course no longer available" and no link when there is no href', () => {
    const { container } = render(
      <CourseChip name="Old course" icon="alert" colour="cat-2" unavailableLabel="Course no longer available" />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/Old course/)).toBeTruthy();
    expect(screen.getByText('Course no longer available')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('carries the category colour token', () => {
    const { container } = render(<CourseChip name="X" icon="book" colour="cat-5" href="#/x" unavailableLabel="Gone" />);
    expect(container.querySelector('[data-colour="cat-5"]')).toBeTruthy();
  });
});

describe('LeaderboardList', () => {
  const rows = [
    { id: 'a', rank: 1, tied: false, name: 'Daniel', valueText: '42 correct' },
    { id: 'b', rank: 2, tied: true, name: 'Jade', valueText: '40 correct', isViewer: true },
    { id: 'c', rank: 2, tied: true, name: 'Sam', valueText: '40 correct' },
  ];
  const props = { label: 'Most questions answered correctly', rows, jointLabel: 'joint', youLabel: 'You' };

  it('is an ordered list with one item per row, in the order given', () => {
    render(<LeaderboardList {...props} />);
    const list = screen.getByRole('list', { name: 'Most questions answered correctly' });
    expect(list.tagName).toBe('OL');
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBe(3);
    expect(items[0]!.textContent).toContain('Daniel');
    expect(items[0]!.textContent).toContain('42 correct');
  });

  it('writes tied ranks as text including "joint" and leaves untied ranks plain', () => {
    render(<LeaderboardList {...props} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]!.textContent).not.toContain('joint');
    expect(items[1]!.textContent).toMatch(/joint/);
    expect(items[1]!.textContent).toMatch(/2/);
    expect(items[2]!.textContent).toMatch(/joint/);
  });

  it('marks the viewer row with the word You, an icon and a data marker, and no other row', () => {
    render(<LeaderboardList {...props} />);
    const items = screen.getAllByRole('listitem');
    expect(within(items[1]!).getByText('You')).toBeTruthy();
    expect(items[1]!.querySelector('svg')).toBeTruthy();
    expect(items[1]!.getAttribute('data-viewer')).toBe('true');
    expect(items[0]!.getAttribute('data-viewer')).not.toBe('true');
    expect(within(items[0]!).queryByText('You')).toBeNull();
  });

  it('shows a separate private position line outside the list when given', () => {
    render(<LeaderboardList {...props} privatePositionText="You're 2nd of 13" />);
    const line = screen.getByText("You're 2nd of 13");
    expect(line.closest('ol')).toBeNull();
  });

  it('shows no private line when not given', () => {
    render(<LeaderboardList {...props} />);
    expect(screen.queryByText(/of 13/)).toBeNull();
  });
});

describe('Celebration', () => {
  const props = { message: 'Module complete. Well done!' };

  it('announces the message politely', () => {
    render(<Celebration {...props} reducedMotion={false} />);
    const live = screen.getByText('Module complete. Well done!').closest('[aria-live]');
    expect(live?.getAttribute('aria-live')).toBe('polite');
  });

  it('plays the ring, tick and a confetti burst when motion is allowed', () => {
    const { container } = render(<Celebration {...props} reducedMotion={false} />);
    expect(container.querySelectorAll('[data-confetti]').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-static="true"]')).toBeNull();
  });

  it('is a static tick with no confetti when reducedMotion is true', () => {
    const { container } = render(<Celebration {...props} reducedMotion />);
    expect(container.querySelectorAll('[data-confetti]').length).toBe(0);
    expect(container.querySelector('[data-static="true"]')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('Module complete. Well done!')).toBeTruthy();
  });

  it('is static when the device prefers reduced motion', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored as-is below
    const original = window.matchMedia;
    window.matchMedia = (q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener() {},
      removeEventListener() {},
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- old MediaQueryList shape
      addListener() {},
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- old MediaQueryList shape
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    });
    try {
      const { container } = render(<Celebration {...props} />);
      expect(container.querySelectorAll('[data-confetti]').length).toBe(0);
      expect(container.querySelector('[data-static="true"]')).toBeTruthy();
    } finally {
      window.matchMedia = original;
    }
  });

  it('uses fixed confetti positions: two renders give identical markup', () => {
    const a = render(<Celebration {...props} reducedMotion={false} />).container.innerHTML;
    cleanup();
    const b = render(<Celebration {...props} reducedMotion={false} />).container.innerHTML;
    expect(a).toBe(b);
  });
});

describe('ReadAloudBar', () => {
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
  const setup = () => {
    const speech = fakeSpeech();
    render(<ReadAloudBar paragraphs={paragraphs} speech={speech} labels={labels} rates={[0.75, 1, 1.25]} />);
    return speech;
  };
  const current = () => document.querySelector('[aria-current="true"]')?.textContent;

  it('lists the paragraphs and speaks the first on play, highlighting it', async () => {
    const speech = setup();
    expect(screen.getByText('Second paragraph.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(speech.calls[0]!.text).toBe('First paragraph.');
    expect(speech.calls[0]!.rate).toBe(1);
    expect(current()).toBe('First paragraph.');
  });

  it('turns the play button into Pause while reading and stops speech when paused', async () => {
    const speech = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
    expect(screen.queryByRole('button', { name: 'Read aloud' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(speech.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Read aloud' })).toBeTruthy();
  });

  it('moves to and speaks the next paragraph when one finishes', async () => {
    const speech = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
    const { act } = await import('@testing-library/react');
    act(() => {
      speech.calls[0]!.onEnd();
    });
    expect(speech.calls[1]!.text).toBe('Second paragraph.');
    expect(current()).toBe('Second paragraph.');
  });

  it('goes back to Read aloud after the last paragraph finishes', async () => {
    const speech = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
    const { act } = await import('@testing-library/react');
    act(() => {
      speech.calls[0]!.onEnd();
    });
    act(() => {
      speech.calls[1]!.onEnd();
    });
    act(() => {
      speech.calls[2]!.onEnd();
    });
    expect(speech.calls.length).toBe(3);
    expect(screen.getByRole('button', { name: 'Read aloud' })).toBeTruthy();
  });

  it('skips forward and back, speaking the new paragraph while playing', async () => {
    const speech = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next paragraph' }));
    expect(speech.calls.at(-1)!.text).toBe('Second paragraph.');
    expect(current()).toBe('Second paragraph.');
    await userEvent.click(screen.getByRole('button', { name: 'Previous paragraph' }));
    expect(speech.calls.at(-1)!.text).toBe('First paragraph.');
    expect(current()).toBe('First paragraph.');
  });

  it('skips while paused by moving the highlight without speaking', async () => {
    const speech = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Next paragraph' }));
    expect(speech.speak).not.toHaveBeenCalled();
    expect(current()).toBe('Second paragraph.');
  });

  it('does not go past the first or last paragraph', async () => {
    setup();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Previous paragraph' }).disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Next paragraph' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next paragraph' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next paragraph' }).disabled).toBe(true);
    expect(current()).toBe('Third paragraph.');
  });

  it('changes the speaking rate from the speed control and re-speaks the current paragraph at it', async () => {
    const speech = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Reading speed' }), '1.25');
    expect(speech.calls.at(-1)!.rate).toBe(1.25);
    expect(speech.calls.at(-1)!.text).toBe('First paragraph.');
  });

  it('stops speech when it unmounts', () => {
    const speech = fakeSpeech();
    const { unmount } = render(<ReadAloudBar paragraphs={paragraphs} speech={speech} labels={labels} rates={[1]} />);
    unmount();
    expect(speech.stop).toHaveBeenCalled();
  });
});
