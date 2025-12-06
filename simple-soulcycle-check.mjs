// simple-soulcycle-check.mjs - Quick check of SoulCycle website
import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: false
  });

  const page = await browser.newPage();

  console.log('Testing main SoulCycle URLs...\n');

  const urlsToTest = [
    'https://www.soulcycle.com',
    'https://www.soulcycle.com/find-a-class',
    'https://www.soulcycle.com/find-a-class/',
    'https://www.soul-cycle.com',
    'https://www.soul-cycle.com/find-a-class/'
  ];

  for (const url of urlsToTest) {
    try {
      console.log(`🔗 Testing: ${url}`);
      const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });

      console.log(`   Status: ${response.status()}`);
      console.log(`   Final URL: ${page.url()}`);

      const title = await page.title();
      console.log(`   Title: ${title}`);

      // Take a quick screenshot
      const filename = url.replace(/https?:\/\//, '').replace(/\//g, '_') + '.png';
      await page.screenshot({ path: filename, fullPage: false });
      console.log(`   Screenshot: ${filename}\n`);

      // If this URL works, let's check for class elements
      if (response.status() === 200 && !title.includes('Not Found')) {
        const classElements = await page.evaluate(() => {
          const selectors = [
            '[class*="class"]',
            '[class*="Class"]',
            '[class*="schedule"]',
            '[class*="Schedule"]',
            '[data-testid]',
            'button',
            'a[href*="class"]',
            'a[href*="schedule"]'
          ];

          const results = {};
          selectors.forEach(sel => {
            const elements = document.querySelectorAll(sel);
            if (elements.length > 0 && elements.length < 100) {
              results[sel] = {
                count: elements.length,
                samples: Array.from(elements).slice(0, 3).map(el => el.textContent?.trim().substring(0, 50))
              };
            }
          });
          return results;
        });

        console.log('   Found elements:');
        console.log(JSON.stringify(classElements, null, 2));
      }

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}\n`);
    }
  }

  console.log('\n✅ Check complete. Browser will close in 30 seconds...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  await browser.close();
})();
