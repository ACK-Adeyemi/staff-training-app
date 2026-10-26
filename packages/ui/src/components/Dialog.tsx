import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  /** Replaces the default centred-box layout classes (used by Sheet). */
  className?: string;
}

/** Native modal dialog. Escape closes it and focus goes back to whatever opened it. */
export function Dialog({ open, title, onClose, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.hasAttribute('open')) {
      opener.current = document.activeElement;
      // Fall back to the plain open attribute where showModal is missing (older engines, jsdom).
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
      // Browsers do this themselves; be explicit so keyboard users always land inside.
      if (!dlg.contains(document.activeElement)) {
        (dlg.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]') ?? dlg).focus();
      }
    } else if (!open && dlg.hasAttribute('open')) {
      if (typeof dlg.close === 'function') dlg.close();
      else dlg.removeAttribute('open');
    }
    if (!open && opener.current instanceof HTMLElement) {
      opener.current.focus();
      opener.current = null;
    }
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`${className ?? 'm-auto max-w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-lg)]'} border-2 border-[var(--color-border)] bg-[var(--color-bg)] p-6 text-[var(--color-text)] backdrop:bg-black/60`}
    >
      <h2 id={titleId} className="mb-4 text-xl font-bold">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
