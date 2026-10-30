import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Outlet } from 'react-router';
import { UpdatePrompt } from '../app/UpdatePrompt';
import { DemoBadge } from './DemoBadge';
import { DemoMenu } from './DemoMenu';
import { PresenterPanel } from './PresenterPanel';
import { TourOverlay } from './TourOverlay';
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
  const [top, setTop] = useState<HTMLElement | null>(null);
  // The badge lives in one element that is moved between the layout's top row and a shell's slot, so it is never
  // torn down and rebuilt when a shell appears or changes.
  const [host] = useState(() => document.createElement('div'));
  useLayoutEffect(() => {
    const parent = slot ?? top;
    if (parent && host.parentNode !== parent) parent.appendChild(host);
  }, [slot, top, host]);
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
      {slot ? null : <div ref={setTop} className="flex justify-end px-4 pt-2" />}
      {createPortal(badge, host)}
      <SlotContext value={setSlot}>
        <Outlet />
      </SlotContext>
      <UpdatePrompt />
      <TourOverlay />
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
