/**
 * Applies the stored theme before first paint.
 *
 * This has to be a blocking inline script in <head>. Any React-based approach
 * runs after hydration, which means a dark-mode user sees a white flash on
 * every navigation — the one accessibility bug people actually complain about.
 *
 * It reads the same localStorage keys the settings page writes, so the server
 * never needs to know the theme and the page stays statically cacheable.
 */
const SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem('lx-theme') || 'system';
    var resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.style.colorScheme = resolved;

    if (localStorage.getItem('lx-contrast') === 'high') {
      document.documentElement.classList.add('contrast-high');
    }
    if (localStorage.getItem('lx-motion') === 'reduced') {
      document.documentElement.classList.add('motion-reduced');
    }
    var scale = localStorage.getItem('lx-font-scale');
    if (scale) document.documentElement.style.setProperty('--font-scale', scale);
  } catch (e) {
    /* Private browsing can throw on localStorage access — the default theme is
       a perfectly acceptable outcome, so this is intentionally swallowed. */
  }
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
