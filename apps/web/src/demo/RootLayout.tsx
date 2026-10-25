import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Outlet } from 'react-router';
import { DemoBadge } from './DemoBadge';
import { DemoMenu } from './DemoMenu';
import { PresenterPanel } from './PresenterPanel';
import { takeEarlyShortcut } from './earlyShortcut';
import { useShortcut } from './useShortcut';

const SlotContext = createContext<((el: HTMLElement | null) => void) | null>(null);

/** Where a shell wants the Demo badge to appear (its header). The badge is still rendered once, by the layout. */
export function DemoBadgeSlot() {
  const setSlot = useContext(SlotContext);
  return <span ref={setSlot} />;
}

type Open = 'none' | 'menu' | 'panel';

/** Wraps every route: the one Demo badge, the Demo menu and the presenter panel. */
export function RootLayout() {
  const [open, setOpen] = useState<Open>(() => (takeEarlyShortcut() ? 'panel' : 'none'));
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useShortcut('Shift+Alt+KeyP', () => {
    setOpen('panel');
  });
  const badge: ReactNode = (
    <DemoBadge
      onTap={() => {
        setOpen('menu');
      }}
      onLongPress={() => {
        setOpen('panel');
      }}
    />
  );
  return (
    <>
      {slot ? null : <div className="flex justify-end px-4 pt-2">{badge}</div>}
      {slot ? createPortal(badge, slot) : null}
      <SlotContext value={setSlot}>
        <Outlet />
      </SlotContext>
      <DemoMenu
        open={open === 'menu'}
        onClose={() => {
          setOpen('none');
        }}
        onOpenPresenter={() => {
          setOpen('panel');
        }}
      />
      <PresenterPanel
        open={open === 'panel'}
        onClose={() => {
          setOpen('none');
        }}
      />
    </>
  );
}
