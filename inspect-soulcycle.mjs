// inspect-soulcycle.mjs - Inspect SoulCycle website structure
import puppeteer from 'puppeteer';

const urls = [
  'https://www.soul-cycle.com/find-a-class/',
  'https://www.soul-cycle.com/studios/newyork/tribeca/'
];

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true
  });

  for (const url of urls) {
    console.log(`\n\n🔍 Inspecting: ${url}\n`);

    const page = await browser.newPage();

    // Monitor API calls
    const apiCalls = [];
    page.on('response', async response => {
      const url = response.url();
      if (
        url.includes('api') ||
        url.includes('class') ||
        url.includes('schedule') ||
        url.includes('graphql')
      ) {
        console.log('   📡 API Call:', url);
        apiCalls.push({
          url,
          status: response.status(),
          contentType: response.headers()['content-type']
        });

        try {
          if (url.includes('json') || response.headers()['content-type']?.includes('json')) {
            const data = await response.json();
            console.log('   📦 Response preview:', JSON.stringify(data).substring(0, 300));
          }
        } catch (e) {
          // Not JSON or failed to parse
        }
      }
    });

    try {
      await page.goto(url, { waitUntil: 'networkidle0' });
      await page.waitForTimeout(5000);

      // Take screenshot
      const filename = url.split('/').filter(Boolean).pop() || 'home';
      await page.screenshot({
        path: `soulcycle-${filename}.png`,
        fullPage: true
      });

      // Inspect page structure
      const structure = await page.evaluate(() => {
        // Look for class elements
        const selectors = [
          '.class',
          '.class-card',
          '.class-item',
          '.session',
          '[data-testid*="class"]',
          '[class*="Class"]',
          '[class*="class"]',
          '.schedule-item'
        ];

        const found = {};
        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            found[selector] = {
              count: elements.length,
              sample: elements[0]?.textContent?.substring(0, 150)
            };
          }
        });

        // Check for React/Vue app
        const hasReact = !!document.querySelector('[data-reactroot], #root, #app');
        const hasVue = !!document.querySelector('[data-v-]');

        // Look for schedule data in scripts
        const scripts = Array.from(document.querySelectorAll('script'));
        const dataScripts = scripts
          .filter(s => s.textContent?.includes('schedule') || s.textContent?.includes('class'))
          .map(s => s.textContent?.substring(0, 200));

        return {
          title: document.title,
          url: window.location.href,
          framework: hasReact ? 'React' : hasVue ? 'Vue' : 'Unknown',
          foundSelectors: found,
          potentialDataScripts: dataScripts.slice(0, 3)
        };
      });

      console.log('\n📋 Page Structure:');
      console.log(JSON.stringify(structure, null, 2));

      console.log('\n📡 API Calls Summary:');
      apiCalls.forEach(call => {
        console.log(`   ${call.status} ${call.url}`);
      });

    } catch (error) {
      console.error('   ❌ Error:', error.message);
    }

    await page.close();
  }

  // Keep browser open for manual inspection
  console.log('\n\n⏳ Browser will stay open for 60 seconds for manual inspection...');
  await new Promise(resolve => setTimeout(resolve, 60000));

  await browser.close();
})();
