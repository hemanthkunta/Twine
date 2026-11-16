async page => {
  await page.locator('aria-ref=f2e620').hover();
  await page.getByRole('button', { name: 'Forward', exact: true }).click();
}
