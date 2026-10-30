/** True on Apple hardware, where shortcuts use Command instead of Control. iPadOS counts too: it reports a Mac platform. */
const apple = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad|ipod/i.test(ua.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent ?? '');
})();

/** A shortcut hint in the platform's own notation, e.g. `shortcut('K')` is ⌘ K on macOS and Ctrl K elsewhere. */
export const shortcut = (key: string) => (apple ? `⌘ ${key}` : `Ctrl ${key}`);
