import { Button, Dialog } from '@sta/ui';

/** A short yes or no question in a dialog. Escape and the cancel button both mean "no". */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      {open ? (
        <>
          <p className="mt-0">{body}</p>
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy} onClick={onConfirm}>
              {confirmLabel}
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              {cancelLabel}
            </Button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
