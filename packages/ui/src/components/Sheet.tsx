import type { ReactNode } from 'react';
import { Dialog } from './Dialog';

export interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
}

/** Bottom sheet on phones, side panel from 48rem. Built on Dialog, so focus, Escape and focus return come with it. */
const layout =
  'fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85vh] w-full max-w-none overflow-y-auto rounded-t-[var(--radius-lg)] ' +
  'min-[48rem]:inset-y-0 min-[48rem]:start-auto min-[48rem]:end-0 min-[48rem]:h-full min-[48rem]:max-h-none min-[48rem]:w-[28rem] min-[48rem]:max-w-[90vw] min-[48rem]:rounded-none';

export function Sheet({ open, title, onClose, children }: SheetProps) {
  return (
    <Dialog open={open} title={title} onClose={onClose} className={layout}>
      {children}
    </Dialog>
  );
}
