export async function openEditor(page) {
  await page.locator('.project-home').waitFor();
  await page.waitForFunction(() => !document.querySelector('.home-empty[role=status]'));
  const resume = page.getByRole('button', { name: 'Continue editing', exact: true });
  if (await resume.count()) await resume.click();
  else await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('button', { name: 'Projects', exact: true }).waitFor();
}
export async function projectAction(page, name, action) {
  const row = page.locator('.home-project-row').filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) });
  await row.getByRole('button', { name: `Actions for ${name}`, exact: true }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}
export async function returnHome(page) {
  await page.locator('.media-status').filter({ hasText: /^Importing/ }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.locator('.project-home').waitFor();
}
/** Waits for a media item's source check, reconnecting `file` if the source is missing. */
export async function ensureSource(page, name, file) {
  const item = page.locator('.media-item[data-source]').filter({ hasText: name });
  await item.waitFor();
  if (await item.getAttribute('data-source') === 'missing') await page.locator(`input[aria-label="Reconnect ${name}"]`).setInputFiles(file);
  await page.locator('.media-item[data-source="ready"]').filter({ hasText: name }).waitFor();
}
