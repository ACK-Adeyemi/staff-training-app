// M3 chunk 12: new packages/ui components. All user-facing words arrive through props.
//
// Intended API (the implementer follows this; all exported from ../index):
//  Banner        { tone: 'info'|'success'|'warning'|'danger'; title?: string; children: text; action?: { label; onClick } }
//                role="status" (info/success) or "alert" (warning/danger); tone has an icon (svg) and the text.
//  Collapsible   { title: string; defaultOpen?: boolean; children }  button aria-expanded + aria-controls; panel hidden when closed.
//  StatCard      { label; value: string; hint?: string }  rendered as a term/definition pair.
//  StatusBar     { description; segments: {label; value; tone?}[]; labelHeader; valueHeader; tableCaption; showTableLabel; hideTableLabel }
//                role="img" bar, legend listing "label value", toggle button swaps in a table with the same numbers.
//  Histogram     same props as BarChart (ChartProps); toggle table.
//  Agenda        { groups: { heading; items: { id; title; detail?; actionLabel?; onAction? }[] }[]; emptyText }
//  MonthGrid     { label; year; month(1-12); weekStartsOn:1; dayNames: string[7]; counts: Record<'YYYY-MM-DD', number>;
//                  countLabel(n, isoDate) => string; selected?: iso; onSelect(iso); listLabel; showListLabel; hideListLabel;
//                  listItems?: {date; text}[] }
//                <table role="grid">, one tab stop (roving), arrows/Home/End move focus, Enter/Space selects, aria-selected.
//  RatingInput   { legend; labels: string[5]; value: number|null; onChange(n) }  radiogroup of 5 radios.
//  TagPicker     { legend; options: {id; label}[]; value: string[]; onChange(ids) }  buttons aria-pressed.
//  PhoneFrame    { title; children }  width 390px, region labelled by title with scroll (tabIndex 0).
//  QrCode        { value; alt: string; textAlternative: string; textAlternativeLabel?: string }  svg role="img" aria-label=alt, plus visible text.
//  CodeInput     { label; value; onChange(v) }  one labelled input: inputMode numeric, autocomplete one-time-code, maxLength 6, digits only.
//  ColourField   { label; value: '#rrggbb'; onChange(hex); hexLabel; pickerLabel; invalidText }
//  ContrastCheck { foreground; background; label; ratioLabel(ratio:string)=>string; passText; failText; minimum?: 4.5 }
//                shows ratio to 1dp, the word pass/fail and an icon.
//  FilePickerButtons { takePhotoLabel; chooseFileLabel; accept; onFile(file) }  two buttons; camera input capture="environment".
//  ImageRedactor (surface has data-testid="redactor-surface"; each box is a button named boxLabel(n)) { src; alt; boxes: Box[]; onChange(boxes); addBoxLabel; removeBoxLabel; boxLabel(n) => string; helpText }
//                Box = { x; y; w; h } as fractions 0..1 of the image. Add box adds centred box and selects it;
//                arrows move 0.02, Shift+arrows resize 0.02; Remove box removes selected; pointer drag draws a box.
//  SiteSwitcher  { label; sites: {id; name}[]; value: string; onChange(id) }  labelled <select>.
//  DescriptionList { items: { term; description: ReactNode }[] }  <dl>.
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Agenda,
  Banner,
  CodeInput,
  Collapsible,
  ColourField,
  ContrastCheck,
  DescriptionList,
  FilePickerButtons,
  Histogram,
  ImageRedactor,
  MonthGrid,
  PhoneFrame,
  QrCode,
  RatingInput,
  SiteSwitcher,
  StatCard,
  StatusBar,
  TagPicker,
} from '../index';

afterEach(cleanup);

describe('Banner', () => {
  it('shows the text with an icon and uses alert for warnings', () => {
    const { container } = render(
      <Banner tone="warning" title="Payment late">
        Fix it soon
      </Banner>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Payment late');
    expect(alert).toHaveTextContent('Fix it soon');
    expect(container.querySelector('svg')).not.toBeNull();
  });
  it('uses status for info and runs the optional action', async () => {
    const onClick = vi.fn();
    render(
      <Banner tone="info" action={{ label: 'Fix now', onClick }}>
        Heads up
      </Banner>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Heads up');
    await userEvent.click(screen.getByRole('button', { name: 'Fix now' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
  it('has no action button when none is given', () => {
    render(<Banner tone="success">Done</Banner>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Collapsible', () => {
  it('starts closed and toggles aria-expanded with the keyboard', async () => {
    render(
      <Collapsible title="More detail">
        <p>Hidden words</p>
      </Collapsible>,
    );
    const btn = screen.getByRole('button', { name: 'More detail' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Hidden words')).not.toBeVisible();
    btn.focus();
    await userEvent.keyboard('{Enter}');
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Hidden words')).toBeVisible();
    await userEvent.keyboard(' ');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });
  it('can start open', () => {
    render(
      <Collapsible title="T" defaultOpen>
        <p>Shown</p>
      </Collapsible>,
    );
    expect(screen.getByRole('button', { name: 'T' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Shown')).toBeVisible();
  });
  it('points aria-controls at the panel', () => {
    render(
      <Collapsible title="T" defaultOpen>
        <p>Shown</p>
      </Collapsible>,
    );
    const id = screen.getByRole('button', { name: 'T' }).getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)).toHaveTextContent('Shown');
  });
});

describe('StatCard', () => {
  it('pairs the label with its value and optional hint', () => {
    render(<StatCard label="Completed" value="87%" hint="of 24 people" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('87%')).toBeInTheDocument();
    expect(screen.getByText('of 24 people')).toBeInTheDocument();
  });
});

const chartText = {
  labelHeader: 'Band',
  valueHeader: 'People',
  tableCaption: 'Score bands',
  showTableLabel: 'Show as table',
  hideTableLabel: 'Hide table',
};

describe('StatusBar', () => {
  const props = {
    description: 'Of 10 people, 6 are current, 3 are due soon and 1 is overdue',
    segments: [
      { label: 'Current', value: 6 },
      { label: 'Due soon', value: 3 },
      { label: 'Overdue', value: 1 },
    ],
    ...chartText,
  };
  it('is an image with a description and a legend with words and numbers', () => {
    render(<StatusBar {...props} />);
    expect(screen.getByRole('img', { name: props.description })).toBeInTheDocument();
    expect(screen.getByText(/Overdue/)).toHaveTextContent('1');
    expect(screen.getByText(/Current/)).toHaveTextContent('6');
  });
  it('offers a table with the same numbers', async () => {
    render(<StatusBar {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    const table = screen.getByRole('table', { name: 'Score bands' });
    expect(within(table).getByRole('columnheader', { name: 'People' })).toBeInTheDocument();
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) =>
        within(r)
          .getAllByRole('cell')
          .map((c) => c.textContent),
      );
    expect(rows).toEqual([
      ['Current', '6'],
      ['Due soon', '3'],
      ['Overdue', '1'],
    ]);
    expect(screen.getByRole('button', { name: 'Hide table' })).toBeInTheDocument();
  });
});

describe('Histogram', () => {
  it('draws the bars and lets people swap to a table with the same numbers', async () => {
    render(
      <Histogram
        description="Scores: 0 to 49 had 2, 50 to 100 had 8"
        data={[
          { label: '0-49', value: 2 },
          { label: '50-100', value: 8 },
        ]}
        {...chartText}
      />,
    );
    expect(screen.getByRole('img', { name: /Scores/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    const table = screen.getByRole('table', { name: 'Score bands' });
    expect(within(table).getByRole('cell', { name: '50-100' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '8' })).toBeInTheDocument();
  });
});

describe('Agenda', () => {
  const groups = [
    {
      heading: 'Today',
      items: [
        { id: 'a', title: 'Fire safety due', detail: 'Due 3 Nov', actionLabel: 'Open Fire safety', onAction: vi.fn() },
      ],
    },
    { heading: 'This week', items: [{ id: 'b', title: 'Paediatric first aid renewal' }] },
  ];
  it('groups items under headings in order', () => {
    render(<Agenda groups={groups} emptyText="Nothing coming up" />);
    const heads = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(heads).toEqual(['Today', 'This week']);
    expect(screen.getByText('Fire safety due')).toBeInTheDocument();
    expect(screen.getByText('Due 3 Nov')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(2);
  });
  it('runs an item action', async () => {
    render(<Agenda groups={groups} emptyText="Nothing coming up" />);
    await userEvent.click(screen.getByRole('button', { name: 'Open Fire safety' }));
    expect(groups[0]!.items[0]!.onAction).toHaveBeenCalledOnce();
  });
  it('shows the empty text when there are no items', () => {
    render(<Agenda groups={[]} emptyText="Nothing coming up" />);
    expect(screen.getByText('Nothing coming up')).toBeInTheDocument();
  });
});

describe('MonthGrid', () => {
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  function Host({ onSelect = () => {} }: { onSelect?: (iso: string) => void }) {
    const [sel, setSel] = useState<string | undefined>(undefined);
    return (
      <MonthGrid
        label="November 2026"
        year={2026}
        month={11}
        weekStartsOn={1}
        dayNames={dayNames}
        counts={{ '2026-11-03': 2, '2026-11-10': 1 }}
        countLabel={(n, iso) => `${n} items on ${iso}`}
        selected={sel}
        onSelect={(iso) => {
          setSel(iso);
          onSelect(iso);
        }}
        listLabel="List view"
        showListLabel="Show as list"
        hideListLabel="Show grid"
        listItems={[{ date: '2026-11-03', text: 'Fire safety due' }]}
      />
    );
  }
  it('is a grid with day headers and a cell per day of the month', () => {
    render(<Host />);
    const grid = screen.getByRole('grid', { name: 'November 2026' });
    expect(
      within(grid)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(dayNames);
    expect(
      within(grid)
        .getAllByRole('gridcell')
        .filter((c) => /^\d/.test(c.textContent ?? '')).length,
    ).toBe(30);
  });
  it('exposes item counts in the accessible name, not by colour', () => {
    render(<Host />);
    expect(screen.getByRole('gridcell', { name: /2 items on 2026-11-03/ })).toBeInTheDocument();
  });
  it('has a single tab stop and arrow keys move focus by day and week', async () => {
    render(<Host />);
    await userEvent.tab();
    const first = document.activeElement as HTMLElement;
    expect(first.closest('[role=grid]')).not.toBeNull();
    const start = first.textContent;
    await userEvent.keyboard('{ArrowRight}');
    const afterRight = (document.activeElement as HTMLElement).textContent;
    expect(afterRight).not.toBe(start);
    await userEvent.keyboard('{ArrowDown}');
    const down = document.activeElement as HTMLElement;
    expect(down.closest('[role=grid]')).not.toBeNull();
    await userEvent.keyboard('{ArrowLeft}{ArrowUp}');
    expect((document.activeElement as HTMLElement).textContent).toBe(start);
    const tabbable = screen.getAllByRole('gridcell').filter((c) => c.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
  });
  it('selects a day with Enter and marks it selected', async () => {
    const onSelect = vi.fn();
    render(<Host onSelect={onSelect} />);
    const cell = screen.getByRole('gridcell', { name: /2 items on 2026-11-03/ });
    cell.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('2026-11-03');
    expect(screen.getByRole('gridcell', { name: /2026-11-03/ })).toHaveAttribute('aria-selected', 'true');
  });
  it('offers a list alternative', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Show as list' }));
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.getByText('Fire safety due')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show grid' }));
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });
});

describe('RatingInput', () => {
  const labels = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  it('is a radio group of five with labels and a legend', () => {
    render(<RatingInput legend="Rate this module" labels={labels} value={null} onChange={() => {}} />);
    const group = screen.getByRole('radiogroup', { name: 'Rate this module' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(5);
    expect(radios.map((r) => r.getAttribute('aria-label') ?? r.closest('label')?.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Excellent')]),
    );
    expect(screen.getByRole('radio', { name: /Good/ })).not.toBeChecked();
  });
  it('reports the chosen number and shows the current one', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<RatingInput legend="Rate" labels={labels} value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /Very good/ }));
    expect(onChange).toHaveBeenCalledWith(4);
    rerender(<RatingInput legend="Rate" labels={labels} value={4} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: /Very good/ })).toBeChecked();
  });
  it('moves with arrow keys', async () => {
    const onChange = vi.fn();
    render(<RatingInput legend="Rate" labels={labels} value={2} onChange={onChange} />);
    screen.getByRole('radio', { name: /Fair/ }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith(3);
  });
});

describe('TagPicker', () => {
  const options = [
    { id: 'clear', label: 'Clear' },
    { id: 'unclear', label: 'Unclear' },
  ];
  it('toggles chips with aria-pressed and reports the new list', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TagPicker legend="What was it like?" options={options} value={['clear']} onChange={onChange} />,
    );
    expect(screen.getByRole('group', { name: 'What was it like?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Unclear' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Unclear' }));
    expect(onChange).toHaveBeenLastCalledWith(['clear', 'unclear']);
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    rerender(<TagPicker legend="What was it like?" options={options} value={[]} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('PhoneFrame', () => {
  it('is 390px wide with a titled, keyboard-scrollable region', () => {
    render(
      <PhoneFrame title="Phone preview">
        <p>Lesson 1</p>
      </PhoneFrame>,
    );
    const region = screen.getByRole('region', { name: 'Phone preview' });
    expect(region).toHaveTextContent('Lesson 1');
    expect(region.tabIndex).toBe(0);
    const frame = region.closest('[data-phone-frame]') as HTMLElement | null;
    expect(frame).not.toBeNull();
    expect(frame!.style.width).toBe('390px');
  });
});

describe('QrCode', () => {
  it('draws an svg with an accessible name and shows the text alternative', () => {
    render(
      <QrCode
        value="otpauth://totp/Demo?secret=ABCDEFGH"
        alt="Setup code"
        textAlternative="ABCD EFGH"
        textAlternativeLabel="Or type this key"
      />,
    );
    const svg = screen.getByRole('img', { name: 'Setup code' });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.querySelectorAll('rect, path').length).toBeGreaterThan(0);
    expect(screen.getByText('Or type this key')).toBeInTheDocument();
    expect(screen.getByText('ABCD EFGH')).toBeInTheDocument();
  });
  it('encodes different values differently', () => {
    const a = render(<QrCode value="aaaa" alt="A" textAlternative="a" />);
    const htmlA = a.container.querySelector('svg')!.innerHTML;
    cleanup();
    const b = render(<QrCode value="zzzz9999" alt="B" textAlternative="b" />);
    expect(b.container.querySelector('svg')!.innerHTML).not.toBe(htmlA);
  });
});

describe('CodeInput', () => {
  function Host({ onChange = () => {} }: { onChange?: (v: string) => void }) {
    const [v, setV] = useState('');
    return (
      <CodeInput
        label="Six-digit code"
        value={v}
        onChange={(x) => {
          setV(x);
          onChange(x);
        }}
      />
    );
  }
  it('is a labelled numeric one-time-code field limited to 6', () => {
    render(<Host />);
    const input = screen.getByLabelText('Six-digit code');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('maxlength', '6');
  });
  it('keeps digits only', async () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Six-digit code'), '12a3-45678');
    expect(screen.getByLabelText('Six-digit code')).toHaveValue('123456');
    expect(onChange).toHaveBeenLastCalledWith('123456');
  });
});

describe('ColourField', () => {
  const base = {
    label: 'Brand colour',
    hexLabel: 'Hex value',
    pickerLabel: 'Pick a colour',
    invalidText: 'Use a hex colour like #1a2b3c',
  };
  it('has a hex text input and a native colour input that agree', () => {
    render(<ColourField {...base} value="#336699" onChange={() => {}} />);
    expect(screen.getByLabelText('Hex value')).toHaveValue('#336699');
    const picker = screen.getByLabelText('Pick a colour');
    expect(picker).toHaveAttribute('type', 'color');
    expect(picker).toHaveValue('#336699');
  });
  it('reports valid hex only and explains an invalid one', async () => {
    const onChange = vi.fn();
    function Host() {
      const [v, setV] = useState('#336699');
      return (
        <ColourField
          {...base}
          value={v}
          onChange={(x) => {
            setV(x);
            onChange(x);
          }}
        />
      );
    }
    render(<Host />);
    const hex = screen.getByLabelText('Hex value');
    await userEvent.clear(hex);
    await userEvent.type(hex, '#zzz');
    expect(onChange).not.toHaveBeenCalledWith('#zzz');
    expect(screen.getByText(base.invalidText)).toBeInTheDocument();
    expect(hex).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(hex);
    await userEvent.type(hex, '#AABBCC');
    expect(onChange).toHaveBeenLastCalledWith('#aabbcc');
  });
  it('reports the native picker value', () => {
    const onChange = vi.fn();
    render(<ColourField {...base} value="#336699" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Pick a colour'), { target: { value: '#112233' } });
    expect(onChange).toHaveBeenCalledWith('#112233');
  });
});

describe('ContrastCheck', () => {
  const base = {
    label: 'Button text on button',
    ratioLabel: (r: string) => `Contrast ${r} to 1`,
    passText: 'Passes',
    failText: 'Fails',
  };
  it('shows the ratio, the word Passes and an icon for good contrast', () => {
    const { container } = render(<ContrastCheck {...base} foreground="#000000" background="#ffffff" />);
    expect(screen.getByText('Contrast 21.0 to 1')).toBeInTheDocument();
    expect(screen.getByText('Passes')).toBeInTheDocument();
    expect(screen.queryByText('Fails')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(screen.getByText('Button text on button')).toBeInTheDocument();
  });
  it('shows Fails below the minimum', () => {
    render(<ContrastCheck {...base} foreground="#777777" background="#888888" />);
    expect(screen.getByText('Fails')).toBeInTheDocument();
    expect(screen.queryByText('Passes')).toBeNull();
  });
  it('respects a custom minimum', () => {
    // #767676 on white is about 4.54 to 1.
    render(<ContrastCheck {...base} foreground="#767676" background="#ffffff" minimum={7} />);
    expect(screen.getByText('Fails')).toBeInTheDocument();
  });
});

describe('FilePickerButtons', () => {
  it('has Take a photo (camera capture) and Choose a file, and reports the file', async () => {
    const onFile = vi.fn();
    const { container } = render(
      <FilePickerButtons
        takePhotoLabel="Take a photo"
        chooseFileLabel="Choose a file"
        accept="image/*"
        onFile={onFile}
      />,
    );
    expect(screen.getByRole('button', { name: 'Take a photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeInTheDocument();
    const inputs = Array.from(container.querySelectorAll('input[type=file]'));
    expect(inputs).toHaveLength(2);
    const camera = inputs.find((i) => i.getAttribute('capture') === 'environment')!;
    const plain = inputs.find((i) => !i.hasAttribute('capture'))!;
    expect(camera).toBeTruthy();
    expect(plain).toBeTruthy();
    expect(plain).toHaveAttribute('accept', 'image/*');
    const file = new File(['x'], 'cert.jpg', { type: 'image/jpeg' });
    await userEvent.upload(camera as HTMLInputElement, file);
    expect(onFile).toHaveBeenCalledWith(file);
  });
  it('clicking a button opens the matching hidden input', async () => {
    const { container } = render(
      <FilePickerButtons
        takePhotoLabel="Take a photo"
        chooseFileLabel="Choose a file"
        accept="image/*"
        onFile={() => {}}
      />,
    );
    const camera = container.querySelector('input[capture=environment]') as HTMLInputElement;
    const spy = vi.spyOn(camera, 'click');
    await userEvent.click(screen.getByRole('button', { name: 'Take a photo' }));
    expect(spy).toHaveBeenCalled();
  });
});

describe('ImageRedactor', () => {
  type Box = { x: number; y: number; w: number; h: number };
  function Host({ initial = [], onChange = () => {} }: { initial?: Box[]; onChange?: (b: Box[]) => void }) {
    const [boxes, setBoxes] = useState<Box[]>(initial);
    return (
      <ImageRedactor
        src="data:image/gif;base64,R0lGODlhAQABAAAAACw="
        alt="Screenshot"
        boxes={boxes}
        onChange={(b: Box[]) => {
          setBoxes(b);
          onChange(b);
        }}
        addBoxLabel="Add box"
        removeBoxLabel="Remove box"
        boxLabel={(n: number) => `Blur box ${n}`}
        helpText="Use arrow keys to move, Shift and arrows to resize"
      />
    );
  }
  it('shows the image with its alt text and the help text', () => {
    render(<Host />);
    expect(screen.getByAltText('Screenshot')).toBeInTheDocument();
    expect(screen.getByText(/Shift and arrows/)).toBeInTheDocument();
  });
  it('Add box adds a centred labelled box inside the image', async () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add box' }));
    const [boxes] = onChange.mock.calls.at(-1) as [Box[]];
    expect(boxes).toHaveLength(1);
    const b = boxes[0]!;
    expect(b.w).toBeGreaterThan(0);
    expect(b.h).toBeGreaterThan(0);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w).toBeLessThanOrEqual(1);
    expect(b.y + b.h).toBeLessThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Blur box 1' })).toBeInTheDocument();
  });
  it('arrow keys move the focused box and Shift plus arrows resize it', async () => {
    const onChange = vi.fn();
    render(<Host initial={[{ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }]} onChange={onChange} />);
    const box = screen.getByRole('button', { name: 'Blur box 1' });
    box.focus();
    await userEvent.keyboard('{ArrowRight}');
    let last = (onChange.mock.calls.at(-1) as [Box[]])[0][0]!;
    expect(last.x).toBeGreaterThan(0.4);
    expect(last.w).toBeCloseTo(0.2);
    await userEvent.keyboard('{ArrowDown}');
    last = (onChange.mock.calls.at(-1) as [Box[]])[0][0]!;
    expect(last.y).toBeGreaterThan(0.4);
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
    const resized = (onChange.mock.calls.at(-1) as [Box[]])[0][0]!;
    expect(resized.w).toBeGreaterThan(0.2);
    expect(resized.x).toBeCloseTo(last.x);
    await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}');
    const shrunk = (onChange.mock.calls.at(-1) as [Box[]])[0][0]!;
    expect(shrunk.h).toBeLessThan(resized.h);
  });
  it('keeps boxes inside the image', async () => {
    const onChange = vi.fn();
    render(<Host initial={[{ x: 0.79, y: 0.4, w: 0.2, h: 0.2 }]} onChange={onChange} />);
    screen.getByRole('button', { name: 'Blur box 1' }).focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    const last = (onChange.mock.calls.at(-1) as [Box[]])[0][0]!;
    expect(last.x + last.w).toBeLessThanOrEqual(1 + 1e-9);
  });
  it('Remove box removes the selected box and is disabled with none', async () => {
    const onChange = vi.fn();
    render(<Host initial={[{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }]} onChange={onChange} />);
    screen.getByRole('button', { name: 'Blur box 1' }).focus();
    await userEvent.click(screen.getByRole('button', { name: 'Remove box' }));
    expect((onChange.mock.calls.at(-1) as [Box[]])[0]).toEqual([]);
    expect(screen.getByRole('button', { name: 'Remove box' })).toBeDisabled();
  });
  it('draws a box with a pointer drag', () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    const surface = screen.getByTestId('redactor-surface');
    surface.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(surface, { clientX: 20, clientY: 10, pointerId: 1, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 120, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 120, clientY: 60, pointerId: 1 });
    const [boxes] = onChange.mock.calls.at(-1) as [Box[]];
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.x).toBeCloseTo(0.1);
    expect(boxes[0]!.y).toBeCloseTo(0.1);
    expect(boxes[0]!.w).toBeCloseTo(0.5);
    expect(boxes[0]!.h).toBeCloseTo(0.5);
  });
  it('ignores a tiny accidental tap', () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    const surface = screen.getByTestId('redactor-surface');
    surface.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(surface, { clientX: 20, clientY: 10, pointerId: 1, button: 0 });
    fireEvent.pointerUp(surface, { clientX: 21, clientY: 11, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('SiteSwitcher', () => {
  const sites = [
    { id: 'all', name: 'All sites' },
    { id: 'r', name: 'Riverside' },
    { id: 'm', name: 'Meadow' },
  ];
  it('is a labelled select that reports the chosen site', async () => {
    const onChange = vi.fn();
    render(<SiteSwitcher label="Site" sites={sites} value="all" onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Site' });
    expect(select).toHaveValue('all');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['All sites', 'Riverside', 'Meadow']);
    await userEvent.selectOptions(select, 'Meadow');
    expect(onChange).toHaveBeenCalledWith('m');
  });
});

describe('DescriptionList', () => {
  it('renders terms and descriptions as a dl', () => {
    const { container } = render(
      <DescriptionList
        items={[
          { term: 'Plan', description: 'Standard' },
          { term: 'Renewal', description: '1 Dec 2026' },
        ]}
      />,
    );
    const dl = container.querySelector('dl')!;
    expect(Array.from(dl.querySelectorAll('dt')).map((d) => d.textContent)).toEqual(['Plan', 'Renewal']);
    expect(Array.from(dl.querySelectorAll('dd')).map((d) => d.textContent)).toEqual(['Standard', '1 Dec 2026']);
  });
});
