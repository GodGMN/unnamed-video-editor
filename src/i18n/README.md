# UI localization

English in `locales/en.ts` defines `TranslationKey`. `t(key, params)` works in helpers and workers. React components call `const t = useT()` to subscribe to live locale changes. The existing components import the translator as `translate` to avoid conflicts with track variables.

Add dictionaries as `Dictionary` values in `core.ts`'s `locales` registry. The settings picker reads this registry. Names in the registry are native language names. Spanish lives in `locales/es.ts`; it is typed as a complete `Record`, so a key missing from it fails `tsc`.

Messages can be strings with `{name}` placeholders or plural objects with an `other` branch and optional `one`, `few`, etc. Pass a numeric `count` for plurals. Numeric parameters use `Intl.NumberFormat`; use `formatNumber` for precision and `formatDateTime` for dates. Keep timecodes and machine values such as CSS, codecs, file names, and keyboard events unchanged.

The provider observes locale changes, updates the document language, and synchronizes browser storage events. A stored choice overrides browser detection. Detection walks `navigator.languages` in order and takes the first supported language, matching the full tag, then its base language. Catalan, Basque, Galician, Asturian, Aragonese, Extremaduran and Aranese (`oc-ES`) fall back to Spanish. Anything else falls back to English. Missing dictionary entries warn once per key in development and use English. Export requests carry the selected locale into workers.

Avoid resolving translated labels at module initialization. Use getters or functions for label tables so they refresh when the locale changes. Editable project content and user names are persisted data, not UI labels.

Run `node scripts/audit-i18n.mjs` to check literal JSX text and labels. With Vite running on port 5158 and Playwright installed, run `node scripts/check-i18n.mjs`. `PLAYWRIGHT_PATH`, `CHROMIUM_PATH`, and `I18N_URL` can override the local test setup. The browser check injects a partial test dictionary through a network route, then verifies live switching, reload persistence, fallback, pluralization, and formatting. No test locale ships in the application.
