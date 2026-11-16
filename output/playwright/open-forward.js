async page => {
  await page.locator('aria-ref=f2e225').click();
  await page.getByText('Acceptance secret 741', { exact: true }).last().click({ button: 'right' });
}
