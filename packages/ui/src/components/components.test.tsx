// Chunk 10 (proves F-6): base component rules. Components live in ./ and are exported from ../index.ts.
import { useRef, useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BottomTabBar, Button, Dialog, IconButton, StatusBadge } from '../index';

// jsdom may lack the dialog methods; give it a minimal stand-in so only our code is under test.
beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
});
afterEach(cleanup);

describe('Button', () => {
  it('defaults to type="button"', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('type')).toBe('button');
  });

  it('carries token-based 44px minimum width and height classes', () => {
    render(<Button>Save</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('min-h-[var(--target-min)]');
    expect(cls).toContain('min-w-[var(--target-min)]');
  });

  it('has a focus-visible style hook using the focus token', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button').className).toMatch(/focus-visible:/);
    expect(screen.getByRole('button').className).not.toMatch(/focus-visible:outline-none(?!\S)/);
  });

  it.each(['primary', 'secondary', 'quiet'] as const)('keeps the minimum size in the %s variant', (variant) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole('button').className).toContain('min-h-[var(--target-min)]');
  });

  it('calls onClick when pressed', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('IconButton', () => {
  it('exposes label as its accessible name', () => {
    render(<IconButton label="Close" icon="x-circle" />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('carries the 44px minimum classes, focus hook and type="button"', () => {
    render(<IconButton label="Close" icon="x-circle" />);
    const b = screen.getByRole('button', { name: 'Close' });
    expect(b.className).toContain('min-h-[var(--target-min)]');
    expect(b.className).toContain('min-w-[var(--target-min)]');
    expect(b.className).toMatch(/focus-visible:/);
    expect(b.getAttribute('type')).toBe('button');
  });

  it('hides the decorative icon from assistive tech', () => {
    render(<IconButton label="Close" icon="x-circle" />);
    expect(screen.getByRole('button').querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('StatusBadge', () => {
  const statuses = ['current', 'expiringSoon', 'awaitingCheck', 'overdue', 'notStarted', 'notAssigned'] as const;

  it.each(statuses)('renders an icon and the label for %s', (status) => {
    const { container } = render(<StatusBadge status={status} label={`Label ${status}`} />);
    expect(screen.getByText(`Label ${status}`)).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('never relies on colour alone: the icon is decorative and the word is visible text', () => {
    const { container } = render(<StatusBadge status="overdue" label="Overdue" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toContain('Overdue');
  });

  it('uses different icons for different problem states', () => {
    const a = render(<StatusBadge status="current" label="A" />).container.querySelector('svg')?.innerHTML;
    cleanup();
    const b = render(<StatusBadge status="overdue" label="B" />).container.querySelector('svg')?.innerHTML;
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open it
      </button>
      <Dialog
        open={open}
        title="Reset demo"
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
      >
        <button type="button">Inside</button>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('is a native dialog labelled by its heading', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    const dlg = document.querySelector('dialog');
    expect(dlg).not.toBeNull();
    expect(dlg?.hasAttribute('open')).toBe(true);
    const labelledBy = dlg?.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy as string)?.textContent).toBe('Reset demo');
  });

  it('is not open until open is true', () => {
    render(<Harness />);
    expect(document.querySelector('dialog')?.hasAttribute('open') ?? false).toBe(false);
  });

  it('closes on Escape and calls onClose', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(false);
  });

  it('returns focus to the element that opened it', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(opener);
  });
});

describe('BottomTabBar', () => {
  const items = [
    { id: 'home', label: 'Home', href: '#/staff', icon: 'home' as const },
    { id: 'learn', label: 'Learn', href: '#/staff/learn', icon: 'book' as const },
    { id: 'me', label: 'Me', href: '#/staff/me', icon: 'user' as const },
  ];

  it('renders a labelled nav landmark with every item', () => {
    render(<BottomTabBar label="Main" items={items} currentId="home" />);
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('marks only the current item with aria-current="page"', () => {
    render(<BottomTabBar label="Main" items={items} currentId="learn" />);
    expect(screen.getByRole('link', { name: 'Learn' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Home' }).hasAttribute('aria-current')).toBe(false);
    expect(screen.getByRole('link', { name: 'Me' }).hasAttribute('aria-current')).toBe(false);
  });

  it('gives each item the 44px minimum target', () => {
    render(<BottomTabBar label="Main" items={items} currentId="home" />);
    for (const a of screen.getAllByRole('link')) expect(a.className).toContain('min-h-[var(--target-min)]');
  });
});
