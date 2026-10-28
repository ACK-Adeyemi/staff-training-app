// M3 chunk 16 additions to the ui package: a value suffix for chart tables, a short axis label, and rating radios that
// carry their number in the accessible name.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BarChart, RatingInput } from '../index';

afterEach(cleanup);

describe('chart options', () => {
  const props = {
    description: 'Requirements: A 80%, B 50%.',
    data: [
      { label: 'Fire evacuation', axisLabel: 'Fire', value: 80 },
      { label: 'Basic first aid', value: 50 },
    ],
    labelHeader: 'Name',
    valueHeader: 'Percent',
    tableCaption: 'Percent up to date',
    showTableLabel: 'Show as a table',
    hideTableLabel: 'Show as a chart',
  };

  it('adds the suffix to table values only and draws the short axis label', () => {
    const { container } = render(<BarChart {...props} valueSuffix="%" />);
    const svg = screen.getByRole('img');
    expect(svg.textContent).toContain('Fire');
    expect(svg.textContent).not.toContain('Fire evacuation');
    expect(svg.textContent).toContain('Basic first aid');
    expect(svg.textContent).not.toContain('%');
    fireEvent.click(screen.getByRole('button', { name: 'Show as a table' }));
    const rows = within(container.querySelector('table') as HTMLElement)
      .getAllByRole('row')
      .slice(1);
    expect(rows.map((r) => [...r.querySelectorAll('th, td')].map((c) => c.textContent))).toEqual([
      ['Fire evacuation', '80%'],
      ['Basic first aid', '50%'],
    ]);
  });

  it('leaves table values plain without a suffix', () => {
    const { container } = render(<BarChart {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as a table' }));
    expect(container.querySelector('tbody')?.textContent).toContain('80');
    expect(container.querySelector('tbody')?.textContent).not.toContain('%');
  });
});

describe('RatingInput names', () => {
  it('names each radio with its number and word', () => {
    render(
      <RatingInput
        legend="Your rating"
        labels={['Poor', 'Fair', 'Good', 'Very good', 'Excellent']}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual([
      '1 Poor',
      '2 Fair',
      '3 Good',
      '4 Very good',
      '5 Excellent',
    ]);
  });
});
