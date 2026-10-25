// The app starts after IndexedDB opens. A presenter who presses Shift+Alt+P during that moment
// should still get the panel, so remember the press and let the layout pick it up once mounted.
let pending = false;
let listening = false;

export function listenEarly(): void {
  if (listening) return;
  listening = true;
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' && e.shiftKey && e.altKey && !e.ctrlKey && !e.metaKey) pending = true;
  });
}

/** True once if the shortcut was pressed before the layout mounted. */
export function takeEarlyShortcut(): boolean {
  const was = pending;
  pending = false;
  return was;
}
