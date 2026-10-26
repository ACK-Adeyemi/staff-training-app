// M1 chunk 7: Markdown, ProgressRing, Stepper, ChoiceList, LearnMoreLink, DataTable.
// All user-facing words arrive through props; the tests pass their own labels.
import { useState } from 'react';
import axe from 'axe-core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChoiceList, DataTable, LearnMoreLink, Markdown, ProgressRing, Stepper } from '../index';

afterEach(cleanup);

async function expectNoAxeViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

describe('Markdown', () => {
  it('renders headings, bold text and bullet lists as semantic elements', () => {
    render(<Markdown source={'## Spot the signs\n\nSome **important** words.\n\n- First\n- Second'} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Spot the signs' })).toBeTruthy();
    expect(screen.getByText('important').tagName).toBe('STRONG');
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual(['First', 'Second']);
  });

  it('renders paragraphs separated by blank lines as separate paragraphs', () => {
    const { container } = render(<Markdown source={'One.\n\nTwo.'} />);
    expect(container.querySelectorAll('p').length).toBe(2);
  });

  it('shows a script tag as literal text and creates no script element', () => {
    const { container } = render(<Markdown source={'Hello <script>alert(1)</script> there'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('shows raw HTML such as img onerror as literal text', () => {
    const { container } = render(<Markdown source={'<img src=x onerror=alert(1)>'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('does not turn Markdown links or images into anchors or images', () => {
    const { container } = render(
      <Markdown source={'[click](javascript:alert(1)) and ![pic](https://example.com/a.png)'} />,
    );
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('click');
  });

  it('treats unknown syntax as plain text', () => {
    const { container } = render(<Markdown source={'1. numbered\n# Top heading\n`code`'} />);
    expect(container.textContent).toContain('numbered');
    expect(container.querySelector('code')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Markdown source={'## Title\n\nText **bold**\n\n- a\n- b'} />);
    await expectNoAxeViolations(container);
  });
});

describe('ProgressRing', () => {
  const labels = { valueText: '3 of 5', description: 'Safeguarding: 3 of 5 lessons done', completeLabel: 'Complete' };

  it('shows the value as visible text inside the ring', () => {
    render(<ProgressRing percent={60} {...labels} />);
    expect(screen.getByText('3 of 5')).toBeTruthy();
  });

  it('exposes a text description for assistive technology', () => {
    render(<ProgressRing percent={60} {...labels} />);
    expect(screen.getByText('Safeguarding: 3 of 5 lessons done')).toBeTruthy();
  });

  it('draws the ring as an svg hidden from assistive technology', () => {
    const { container } = render(<ProgressRing percent={60} {...labels} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows a tick and the complete word at 100 percent, not colour alone', () => {
    const { container } = render(<ProgressRing percent={100} {...labels} valueText="5 of 5" />);
    expect(screen.getByText('Complete')).toBeTruthy();
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
  });

  it('does not show the complete word below 100 percent', () => {
    render(<ProgressRing percent={99} {...labels} />);
    expect(screen.queryByText('Complete')).toBeNull();
  });

  it('clamps out of range percentages without throwing', () => {
    expect(() => render(<ProgressRing percent={250} {...labels} />)).not.toThrow();
    expect(() => render(<ProgressRing percent={-5} {...labels} />)).not.toThrow();
  });

  it('has no axe violations', async () => {
    const { container } = render(<ProgressRing percent={100} {...labels} />);
    await expectNoAxeViolations(container);
  });
});

describe('Stepper', () => {
  it('shows the supplied step text', () => {
    render(<Stepper current={2} total={5} label="Step 2 of 5" progressLabel="Lesson progress" />);
    expect(screen.getByText('Step 2 of 5')).toBeTruthy();
  });

  it('exposes a progressbar with aria values and an accessible name', () => {
    render(<Stepper current={2} total={5} label="Step 2 of 5" progressLabel="Lesson progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Lesson progress' });
    expect(bar.getAttribute('aria-valuemin')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('5');
    expect(bar.getAttribute('aria-valuenow')).toBe('2');
    expect(bar.getAttribute('aria-valuetext')).toBe('Step 2 of 5');
  });

  it('updates the aria value when the step changes', () => {
    const { rerender } = render(<Stepper current={1} total={3} label="Step 1 of 3" progressLabel="Progress" />);
    rerender(<Stepper current={3} total={3} label="Step 3 of 3" progressLabel="Progress" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('3');
  });

  it('has no axe violations', async () => {
    const { container } = render(<Stepper current={2} total={5} label="Step 2 of 5" progressLabel="Lesson progress" />);
    await expectNoAxeViolations(container);
  });
});

const options = [
  { id: 'a', label: 'Tell the safeguarding lead' },
  { id: 'b', label: 'Wait and see' },
  { id: 'c', label: 'Ask the parent first' },
];
const stateLabels = { correct: 'Correct answer', incorrect: 'Not correct', selected: 'Your answer' };

function Single({ result }: { result?: { correctIds: string[] } }) {
  const [value, setValue] = useState<string[]>([]);
  return (
    <ChoiceList
      name="q1"
      legend="What should you do first?"
      type="single"
      options={options}
      value={value}
      onChange={setValue}
      result={result}
      stateLabels={stateLabels}
    />
  );
}

describe('ChoiceList', () => {
  it('renders single choice as a labelled group of radios', () => {
    render(<Single />);
    expect(screen.getByRole('group', { name: 'What should you do first?' })).toBeTruthy();
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('name'))).toEqual(['q1', 'q1', 'q1']);
    expect(screen.getByRole('radio', { name: 'Wait and see' })).toBeTruthy();
  });

  it('renders multiple choice as checkboxes', () => {
    render(
      <ChoiceList
        name="q2"
        legend="Pick all"
        type="multiple"
        options={options}
        value={[]}
        onChange={() => {}}
        stateLabels={stateLabels}
      />,
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('reports the chosen id when an option is clicked', async () => {
    const onChange = vi.fn();
    render(
      <ChoiceList
        name="q1"
        legend="L"
        type="single"
        options={options}
        value={[]}
        onChange={onChange}
        stateLabels={stateLabels}
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Wait and see' }));
    expect(onChange).toHaveBeenCalledWith(['b']);
  });

  it('moves the selection with arrow keys', async () => {
    render(<Single />);
    await userEvent.click(screen.getByRole('radio', { name: 'Tell the safeguarding lead' }));
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Wait and see' }).checked).toBe(true);
  });

  it('toggles a checkbox option with Space and adds to existing selections', async () => {
    const onChange = vi.fn();
    render(
      <ChoiceList
        name="q2"
        legend="Pick all"
        type="multiple"
        options={options}
        value={['a']}
        onChange={onChange}
        stateLabels={stateLabels}
      />,
    );
    screen.getByRole('checkbox', { name: 'Wait and see' }).focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('removes an id when a selected checkbox is toggled off', async () => {
    const onChange = vi.fn();
    render(
      <ChoiceList
        name="q2"
        legend="Pick all"
        type="multiple"
        options={options}
        value={['a', 'b']}
        onChange={onChange}
        stateLabels={stateLabels}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tell the safeguarding lead' }));
    expect(onChange).toHaveBeenCalledWith(['b']);
  });

  it('gives every option a 44px minimum height through the target token', () => {
    render(<Single />);
    for (const radio of screen.getAllByRole('radio')) {
      const row = radio.closest('label');
      expect(row, 'option is wrapped in a label').not.toBeNull();
      expect(row!.className).toContain('min-h-[var(--target-min)]');
    }
  });

  it('shows no correct or incorrect words before submitting', () => {
    render(<Single />);
    expect(screen.queryByText('Correct answer')).toBeNull();
    expect(screen.queryByText('Not correct')).toBeNull();
  });

  it('after submit marks a wrong pick with the incorrect word and an icon, and the right option with the correct word', () => {
    render(
      <ChoiceList
        name="q1"
        legend="L"
        type="single"
        options={options}
        value={['b']}
        onChange={() => {}}
        result={{ correctIds: ['a'] }}
        stateLabels={stateLabels}
      />,
    );
    const wrong = screen.getByRole('radio', { name: /Wait and see/ }).closest('label')!;
    expect(within(wrong).getByText('Not correct')).toBeTruthy();
    expect(wrong.querySelector('svg')).not.toBeNull();
    const right = screen.getByRole('radio', { name: /Tell the safeguarding lead/ }).closest('label')!;
    expect(within(right).getByText('Correct answer')).toBeTruthy();
    expect(right.querySelector('svg')).not.toBeNull();
    const untouched = screen.getByRole('radio', { name: /Ask the parent first/ }).closest('label')!;
    expect(within(untouched).queryByText('Correct answer')).toBeNull();
    expect(within(untouched).queryByText('Not correct')).toBeNull();
  });

  it('after submit marks a right pick with the correct word', () => {
    render(
      <ChoiceList
        name="q1"
        legend="L"
        type="single"
        options={options}
        value={['a']}
        onChange={() => {}}
        result={{ correctIds: ['a'] }}
        stateLabels={stateLabels}
      />,
    );
    expect(screen.getAllByText('Correct answer')).toHaveLength(1);
    expect(screen.queryByText('Not correct')).toBeNull();
  });

  it('stops accepting changes after submit', async () => {
    const onChange = vi.fn();
    render(
      <ChoiceList
        name="q1"
        legend="L"
        type="single"
        options={options}
        value={['b']}
        onChange={onChange}
        result={{ correctIds: ['a'] }}
        stateLabels={stateLabels}
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: /Ask the parent first/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('has no axe violations before and after submit', async () => {
    const { container, rerender } = render(<Single />);
    await expectNoAxeViolations(container);
    rerender(
      <ChoiceList
        name="q1"
        legend="L"
        type="single"
        options={options}
        value={['b']}
        onChange={() => {}}
        result={{ correctIds: ['a'] }}
        stateLabels={stateLabels}
      />,
    );
    await expectNoAxeViolations(container);
  });
});

describe('LearnMoreLink', () => {
  const base = {
    url: 'https://www.gov.uk/government/publications/keeping-children-safe-in-education--2',
    label: 'Learn more: Keeping children safe in education',
    newTabLabel: '(opens in a new tab)',
    kindLabel: 'Official guidance',
    domain: 'gov.uk',
    locator: 'Part 1',
  };

  it('renders a safe external anchor', () => {
    render(<LearnMoreLink {...base} />);
    const a = screen.getByRole('link');
    expect(a.getAttribute('href')).toBe(base.url);
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('has an accessible name that starts with the label and ends with the new tab note', () => {
    render(<LearnMoreLink {...base} />);
    const name = screen.getByRole('link').textContent;
    expect(name.startsWith('Learn more: Keeping children safe in education')).toBe(true);
    expect(name.trim().endsWith('(opens in a new tab)')).toBe(true);
    expect(screen.getByRole('link', { name: /\(opens in a new tab\)$/ })).toBeTruthy();
  });

  it('shows the kind, the domain and the locator as visible text with an external icon', () => {
    render(<LearnMoreLink {...base} />);
    const a = screen.getByRole('link');
    expect(a.textContent).toContain('Official guidance');
    expect(a.textContent).toContain('gov.uk');
    expect(a.textContent).toContain('Part 1');
    expect(a.querySelector('svg')).not.toBeNull();
  });

  it('works without a locator', () => {
    const { locator: _locator, ...rest } = base;
    render(<LearnMoreLink {...rest} />);
    expect(screen.getByRole('link')).toBeTruthy();
  });

  it('calls onOpen on click', async () => {
    const onOpen = vi.fn();
    render(<LearnMoreLink {...base} onOpen={onOpen} />);
    const a = screen.getByRole('link');
    a.addEventListener('click', (e) => {
      e.preventDefault(); // stop jsdom navigating
    });
    await userEvent.click(a);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('calls onOpen on middle click (auxclick)', () => {
    const onOpen = vi.fn();
    render(<LearnMoreLink {...base} onOpen={onOpen} />);
    fireEvent(screen.getByRole('link'), new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('runs onOpen before the browser default navigation could be cancelled by later handlers', () => {
    const order: string[] = [];
    render(
      <LearnMoreLink
        {...base}
        onOpen={() => {
          order.push('open');
        }}
      />,
    );
    const a = screen.getByRole('link');
    a.addEventListener('click', (e) => {
      order.push('bubble');
      e.preventDefault();
    });
    fireEvent.click(a);
    expect(order[0]).toBe('open');
  });

  it.each([
    'http://www.gov.uk/page',
    'javascript:alert(1)',
    'data:text/html,hi',
    'https://user:pw@example.com/x',
    'not a url',
  ])('renders no anchor for the unsafe url %s', (url) => {
    const onOpen = vi.fn();
    render(<LearnMoreLink {...base} url={url} onOpen={onOpen} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Learn more: Keeping children safe in education')).toBeTruthy();
  });

  it('has no axe violations', async () => {
    const { container } = render(<LearnMoreLink {...base} />);
    await expectNoAxeViolations(container);
  });
});

describe('DataTable', () => {
  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'status', header: 'Status' },
  ];
  const rows = [
    { id: 'r1', cells: { name: 'Jade', status: 'Done' } },
    { id: 'r2', cells: { name: 'Sam', status: 'Overdue' } },
  ];

  it('renders a table with a caption', () => {
    render(<DataTable caption="Training status" columns={columns} rows={rows} />);
    expect(screen.getByRole('table', { name: 'Training status' })).toBeTruthy();
    expect(screen.getByText('Training status').tagName).toBe('CAPTION');
  });

  it('marks column headers with scope col', () => {
    render(<DataTable caption="T" columns={columns} rows={rows} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual(['Name', 'Status']);
    for (const h of headers) expect(h.getAttribute('scope')).toBe('col');
  });

  it('renders one body row per record with the cell text', () => {
    render(<DataTable caption="T" columns={columns} rows={rows} />);
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByRole('cell', { name: 'Overdue' })).toBeTruthy();
  });

  it('makes the first column row headers with scope row when asked', () => {
    render(<DataTable caption="T" columns={columns} rows={rows} rowHeader />);
    const rh = screen.getAllByRole('rowheader');
    expect(rh.map((h) => h.textContent)).toEqual(['Jade', 'Sam']);
    for (const h of rh) expect(h.getAttribute('scope')).toBe('row');
  });

  it('does not make the first column sticky by default', () => {
    const { container } = render(<DataTable caption="T" columns={columns} rows={rows} />);
    expect(container.querySelector('.sticky')).toBeNull();
  });

  it('makes the first column sticky in header and body when asked', () => {
    const { container } = render(<DataTable caption="T" columns={columns} rows={rows} stickyFirstColumn />);
    expect(container.querySelectorAll('.sticky').length).toBe(3);
  });

  it('flags the print-friendly variant', () => {
    const { container } = render(<DataTable caption="T" columns={columns} rows={rows} printFriendly />);
    expect(container.querySelector('table')!.getAttribute('data-print')).toBe('friendly');
  });

  it('renders cell content that is a React node', () => {
    render(
      <DataTable
        caption="T"
        columns={columns}
        rows={[{ id: 'x', cells: { name: 'Al', status: <strong>Late</strong> } }]}
      />,
    );
    expect(screen.getByText('Late').tagName).toBe('STRONG');
  });

  it('renders a header-only table for no rows without throwing', () => {
    render(<DataTable caption="T" columns={columns} rows={[]} />);
    expect(screen.getAllByRole('row')).toHaveLength(1);
  });

  it('has no axe violations', async () => {
    const { container } = render(<DataTable caption="T" columns={columns} rows={rows} rowHeader stickyFirstColumn />);
    await expectNoAxeViolations(container);
  });
});
