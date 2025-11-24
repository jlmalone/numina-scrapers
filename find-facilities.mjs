import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Check New York Hudson Yards location
  const clubUrl = 'https://www.equinox.com/clubs/newyork/newyork/hudsonyard';

  console.log(`🔍 Inspecting: ${clubUrl}\n`);

  // Listen for network requests to find facility ID
  const requests = [];
  page.on('request', request => {
    if (request.url().includes('api.equinox.com')) {
      requests.push({
        url: request.url(),
        method: request.method(),
        postData: request.postData()
      });
    }
  });

  try {
    await page.goto(clubUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Look for schedule/classes button and click it
    const scheduleButton = await page.$('a[href*="schedule"], button[class*="schedule"]');
    if (scheduleButton) {
      console.log('📅 Found schedule button, clicking...');
      await scheduleButton.click();
      await page.waitForTimeout(3000);
    }

    console.log('\n📡 API Requests captured:');
    requests.forEach((req, i) => {
      console.log(`\nRequest ${i + 1}:`);
      console.log(`  URL: ${req.url}`);
      console.log(`  Method: ${req.method}`);
      if (req.postData) {
        console.log(`  Body: ${req.postData}`);
      }
    });

    // Try to extract facility ID from page source
    const pageContent = await page.content();
    const facilityMatch = pageContent.match(/"facilityId[s]?":\s*\[?(\d+)\]?/);
    if (facilityMatch) {
      console.log(`\n✅ Found facility ID in page: ${facilityMatch[1]}`);
    }

    // Check window object
    const facilityFromWindow = await page.evaluate(() => {
      return window.__NEXT_DATA__?.props?.pageProps?.facilityId ||
             window.__INITIAL_STATE__?.facilityId ||
             null;
    });
    if (facilityFromWindow) {
      console.log(`✅ Found facility ID in window object: ${facilityFromWindow}`);
    }

  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }

  await browser.close();
})();
