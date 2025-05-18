import { test, expect } from '@playwright/test';

test.describe('Swing Analyzer', () => {
  test('should load the application and display the UI', async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:1234');
    
    // Verify that the page title is correct
    await expect(page).toHaveTitle('Swing Analyzer');
    
    // Verify that the main elements are visible
    await expect(page.locator('h1:has-text("Swing Analyzer")')).toBeVisible();
    await expect(page.locator('#load-hardcoded-btn')).toBeVisible();
    await expect(page.locator('#camera-btn')).toBeVisible();
  });

  test('should load hardcoded video and play it', async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:1234');
    
    // Wait for the model to load
    await page.waitForSelector('#status:has-text("Ready")');
    
    // Click the "Load Hardcoded" button
    await page.click('#load-hardcoded-btn');
    
    // Wait for the video to load
    await page.waitForSelector('#status:has-text("Hardcoded video loaded")');
    
    // Verify that the video element has a source
    const videoSrc = await page.$eval('video', (video) => (video as HTMLVideoElement).src);
    expect(videoSrc).toBeTruthy();
    expect(videoSrc).toContain('/videos/swing-sample.mp4');
    
    // Check that the Play/Pause button is not disabled
    await expect(page.locator('#play-pause-btn')).not.toBeDisabled();
    
    // Click Play if the video isn't already playing
    const isPlaying = await page.$eval('#play-pause-btn', button => button.textContent === 'Pause');
    if (!isPlaying) {
      await page.click('#play-pause-btn');
      // Wait for the video to start playing
      await expect(page.locator('#play-pause-btn')).toHaveText('Pause');
    }
    
    // Wait a short time to ensure video is playing
    await page.waitForTimeout(2000);
    
    // Verify that the spine angle is being updated (should be non-zero)
    const spineAngle = await page.$eval('#spine-angle', span => parseInt(span.textContent || '0'));
    expect(spineAngle).not.toBe(0);
    
    // Stop the video
    await page.click('#stop-btn');
    
    // Verify that the video has stopped and play button is showing
    await expect(page.locator('#play-pause-btn')).toHaveText('Play');
  });
}); 