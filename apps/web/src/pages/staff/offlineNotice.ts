// F-2: "Ready to work offline" is told once per page load. A module flag, as app code may not touch storage directly.
let told = false;
export const offlineNoticeTold = (): boolean => told;
export const markOfflineNoticeTold = (): void => {
  told = true;
};
/** For tests. */
export const resetOfflineNotice = (): void => {
  told = false;
};
