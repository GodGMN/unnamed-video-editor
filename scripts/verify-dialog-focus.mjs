// Start Vite, then run with PLAYWRIGHT_MODULE and BASE_URL when using external installations.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(5000);
page.on('pageerror', e => console.error(e.message));
const base = process.env.BASE_URL || 'http://127.0.0.1:5192';
async function contained(dialog) {
  const visited = new Set();
  for (const key of ['Tab', 'Shift+Tab']) for (let i = 0; i < 30; i++) {
    await page.keyboard.press(key);
    assert(await dialog.evaluate(el => el.contains(document.activeElement)), `${key} escaped the modal`);
    visited.add(await page.evaluate(() => document.activeElement.outerHTML));
  }
  assert(visited.size > 1, 'Tab never moved focus');
}
async function escapeTo(opener) {
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'hidden' });
  assert(await opener.evaluate(el => el === document.activeElement), 'opener focus was not restored: ' + await page.evaluate(() => document.activeElement.outerHTML.slice(0,500)));
}
try {
  await page.goto(base);
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  await settings.click();
  const dialog = page.locator('dialog[open]');
  assert.equal(await page.locator(':focus').textContent(), 'Settings.');
  await contained(dialog);
  await page.getByRole('button', { name: 'New project', exact: true }).evaluate(el => el.focus());
  assert(await dialog.evaluate(el => el.contains(document.activeElement)), 'background focus was allowed');
  await page.screenshot({ path: '/tmp/92-settings-focus.png' });
  await escapeTo(settings);
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const exp = page.getByRole('button', { name: /Export/ }).first();
  await exp.click(); await contained(dialog); await escapeTo(exp);
  const editorSettings = page.getByRole('button', { name: 'Settings', exact: true });
  await editorSettings.click();
  const play = page.locator('.play-btn');
  const labelBefore = await play.getAttribute('aria-label');
  await page.evaluate(() => window.addEventListener('keydown', event => {
    if (event.code === 'Space') window.modalSpaceHandled = event.defaultPrevented;
  }, { once: true }));
  await page.keyboard.press('Space');
  assert.equal(await play.getAttribute('aria-label'), labelBefore, 'Space in a modal started editor playback');
  assert.equal(await page.evaluate(() => window.modalSpaceHandled), false, 'background playback consumed Space');
  await escapeTo(editorSettings);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.evaluate(async () => {
    const { createProject } = await import('/src/editor/storage.ts');
    const { seedProject } = await import('/src/editor/seed.ts');
    await createProject(seedProject());
  });
  await page.reload();
  const actions = page.getByRole('button', { name: /^Actions for/ }).first();
  await actions.click(); await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  assert(await page.getByRole('textbox', { name: 'Project name', exact: true }).evaluate(el => el === document.activeElement));
  await page.screenshot({ path: '/tmp/92-rename-focus.png' });
  await contained(dialog); await escapeTo(actions);
  await actions.click(); await page.getByRole('menuitem', { name: /Delete/ }).click();
  await contained(dialog); await escapeTo(actions);
  console.log('PASS settings, export, rename and delete keyboard containment and restoration');
  await page.route('**/src/main.tsx*', route => route.fulfill({ contentType: 'application/javascript', body: `
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import {Dialog} from '/src/components/Dialog.tsx';
    import {ActionMenu} from '/src/components/ActionMenu.tsx';
    import {ColorPopover} from '/src/components/ColorPicker.tsx';
    const h=React.createElement;
    function App(){ const [open,setOpen]=React.useState(false),[nested,setNested]=React.useState(false),[color,setColor]=React.useState(false); const anchor=React.useRef(null);
      return h(React.Fragment,null,h('button',{onClick:()=>setOpen(true)},'Open'),open&&h(Dialog,{id:'outer',title:'Outer',subtitle:'Test',width:500,onClose:()=>setOpen(false)},
        h('button',{onClick:()=>setNested(true)},'Nested'),h('button',{ref:anchor,onClick:()=>setColor(true)},'Color'),color&&h(ColorPopover,{anchor,value:'#FFFFFF',onChange:()=>{},onClose:()=>setColor(false)}),h(ActionMenu,{label:'Portal actions',actions:[{label:'Action',run:()=>{}}]}),
        nested&&h(Dialog,{id:'inner',title:'Inner',subtitle:'Test',width:300,onClose:()=>setNested(false)},h('button',null,'Inner action')))); }
    ReactDOM.createRoot(document.getElementById('root')).render(h(App));` })) ;
  await page.reload(); await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('button', { name: 'Nested', exact: true }).click();
  await contained(page.locator('dialog').last());
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 1);
  assert(await page.getByRole('button', { name: 'Nested', exact: true }).evaluate(el => el === document.activeElement));
  const menu = page.getByRole('button', { name: 'Portal actions' });
  await menu.click();
  assert(await page.getByRole('menuitem').evaluate(el => !!el.closest('dialog[open]') && el === document.activeElement));
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 1);
  assert(await menu.evaluate(el => el === document.activeElement));
  await menu.click();
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('menu').count(), 0);
  assert(await page.locator('dialog[open]').evaluate(el => el.contains(document.activeElement)));
  const color = page.getByRole('button', { name: 'Color', exact: true });
  await color.click();
  const hex = page.getByRole('textbox', { name: 'Hex color', exact: true });
  await hex.focus();
  assert(await hex.evaluate(el => !!el.closest('dialog[open]') && el === document.activeElement));
  await contained(page.locator('dialog[open]'));
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 1);
  assert(await color.evaluate(el => el === document.activeElement));
  await page.keyboard.press('Escape');
  assert(await page.getByRole('button', { name: 'Open', exact: true }).evaluate(el => el === document.activeElement));
  console.log('PASS stacked dialogs, topmost Escape, portal menu/color picker and nested focus restoration');
} finally { await browser.close(); }
