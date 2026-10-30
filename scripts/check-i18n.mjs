import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
// Run against a local Vite server. Set PLAYWRIGHT_PATH when Playwright is installed outside this project.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const warnings = [];
  page.on('console', (message) => { if (message.type() === 'warning') warnings.push(message.text()); });
  // Register a deliberately partial test dictionary without shipping a second language.
  await page.route('**/src/i18n/core.ts*', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    assert.ok(source.includes('let locale = initialLocale();'));
    await route.fulfill({ response, body: source.replace('let locale = initialLocale();', `locales.de = { name: 'Deutsch (test)', messages: { settings: 'Einstellungen', language: 'Sprache', clipCount: { one: '{count} Clip · {time}', other: '{count} Clips · {time}' } } };\nlet locale = initialLocale();`) });
  });
  await page.goto(process.env.I18N_URL ?? 'http://127.0.0.1:5158');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('group', { name: 'Language', exact: true }).getByRole('button', { name: 'Deutsch (test)' }).click();
  await page.getByRole('heading', { name: 'Einstellungen' }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'de');
  await page.screenshot({ path: '/tmp/task-58-test-locale.png' });
  const result = await page.evaluate(async () => {
    const { t, translate, initialLocale, formatNumber, resolveLocale } = await import(performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === '/src/i18n/core.ts').name);
    return { plural: t('clipCount', { count: 1, time: '00:01' }), pluralMany: t('clipCount', { count: 2, time: '00:02' }), fallback: t('previewResolution'), unknown: translate('zz', 'settings'), detected: initialLocale(), stored: localStorage.getItem('editor-locale'), number: formatNumber(1234.5), region: resolveLocale('DE-de'), invalid: resolveLocale('constructor') };
  });
  assert.deepEqual(result, { plural: '1 Clip · 00:01', pluralMany: '2 Clips · 00:02', fallback: 'Preview resolution', unknown: 'Settings', detected: 'de', stored: 'de', number: '1.234,5', region: 'de', invalid: 'en' });
  assert.ok(warnings.some((line) => line.includes('[i18n] Missing de translation: previewResolution')));
  await page.reload();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('heading', { name: 'Einstellungen' }).waitFor();
  await page.getByRole('group', { name: 'Sprache', exact: true }).getByRole('button', { name: 'English' }).click();
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await page.screenshot({ path: process.env.I18N_SCREENSHOT ?? '/tmp/task-58-settings.png' });
  console.log('PASS: live UI switching, persistence across reload, pluralization, interpolation, missing-key warning and fallback, unknown locale, regional detection, Intl number formatting.');
} finally { await browser.close(); }
