async page => {
  await page.locator('aria-ref=f2e413').fill('Core acceptance group');
  await page.locator('aria-ref=f2e430').click();
  await page.locator('aria-ref=f2e456').click();
}
