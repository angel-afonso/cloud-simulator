
import { test, expect } from '@playwright/test';

test('verify game runs without console errors', async ({ page }) => {
  const errors: any[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.goto('http://localhost:3001');

  // Wait for Phaser to initialize
  await page.waitForTimeout(5000);

  // Click Play (1x speed)
  // Find the 1x button. It has text "1x"
  const playButton = page.locator('button', { hasText: '1x' });
  await playButton.click({ force: true });

  // Let it run for a bit
  await page.waitForTimeout(5000);

  console.log('Detected errors:', errors);
  expect(errors.filter(e => !e.includes('favicon.ico'))).toHaveLength(0);

  await page.screenshot({ path: '/home/jules/verification/final_run.png' });
});
