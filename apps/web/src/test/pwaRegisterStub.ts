// Stands in for virtual:pwa-register under Vitest (the real module only exists in a Vite PWA build).
export function registerSW(): (reload?: boolean) => Promise<void> {
  return () => Promise.resolve();
}
