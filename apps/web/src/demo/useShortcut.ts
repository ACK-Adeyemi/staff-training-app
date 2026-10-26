import { useEffect, useRef } from 'react';

/** Runs `onPress` for a combo such as 'Shift+Alt+KeyP'. The last part is matched on `event.code`. */
export function useShortcut(combo: string, onPress: () => void): void {
  const handler = useRef(onPress);
  useEffect(() => {
    handler.current = onPress;
  });
  useEffect(() => {
    const parts = combo.split('+');
    const code = parts[parts.length - 1];
    const mods = new Set(parts.slice(0, -1));
    const listener = (e: KeyboardEvent) => {
      if (
        e.code === code &&
        e.shiftKey === mods.has('Shift') &&
        e.altKey === mods.has('Alt') &&
        e.ctrlKey === mods.has('Ctrl') &&
        e.metaKey === mods.has('Meta')
      ) {
        e.preventDefault();
        handler.current();
      }
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
    };
  }, [combo]);
}
