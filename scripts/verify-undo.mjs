import assert from 'node:assert/strict';
import { openEditor } from './browser-helpers.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5288');
  await openEditor(page);
  const undo = page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true });
  const redo = page.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)', exact: true });
  assert(await undo.isDisabled()); assert(await redo.isDisabled());
  const oldName = await page.locator('.project-name-text').innerText();
  async function rename(name) {
    await page.locator('.project-name').click();
    await page.getByRole('textbox', { name: 'Project name', exact: true }).fill(name);
    await page.getByRole('textbox', { name: 'Project name', exact: true }).press('Enter');
  }
  async function nameIs(name) { await page.waitForFunction(n => document.querySelector('.project-name-text')?.textContent === n, name); }
  await rename('Undo verification');
  await undo.click(); await nameIs(oldName);
  await redo.click(); await nameIs('Undo verification');
  await page.keyboard.press('Control+z'); await nameIs(oldName);
  await page.keyboard.press('Control+Shift+z'); await nameIs('Undo verification');
  await undo.click(); await rename('New branch'); assert(await redo.isDisabled());
  await page.screenshot({ path: '/tmp/undo-redo-verified.png' });
  console.log('PASS: toolbar undo/redo, keyboard shortcuts, initial disabled states and redo invalidation');
} finally { await browser.close(); }
