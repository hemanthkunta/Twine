async page => {
  await page.locator('aria-ref=f2e570').fill('Acceptance group secret 742');
  await page.locator('aria-ref=f2e570').press('Enter');
}
