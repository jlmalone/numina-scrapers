// inspect-soulcycle-v2.mjs - Inspect SoulCycle website with correct URLs
import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true
  });

  const page = await browser.newPage();

  // Monitor API calls
  const apiCalls = [];
  page.on('response', async response => {
    const url = response.url();
    if (
      url.includes('api') ||
      url.includes('class') ||
      url.includes('schedule') ||
      url.includes('graphql') ||
      url.includes('studio')
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
          const preview = JSON.stringify(data).substring(0, 500);
          console.log('   📦 Response preview:', preview);

          // Save full API response if it looks like class data
          if (url.includes('class') || url.includes('schedule') || url.includes('studio')) {
            const fs = await import('fs');
            const filename = `soulcycle-api-${Date.now()}.json`;
            fs.writeFileSync(filename, JSON.stringify(data, null, 2));
            console.log(`   💾 Saved full response to: ${filename}`);
          }
        }
      } catch (e) {
        // Not JSON or failed to parse
      }
    }
  });

  // Test URLs from the search results
  const urlsToTest = [
    'https://www.soul-cycle.com/studios/nyc/',
    'https://www.soul-cycle.com/studios/ny-newyork-nomad/',
    'https://www.soul-cycle.com/find-a-class/studio/20/',
  ];

  for (const url of urlsToTest) {
    console.log(`\n\n🔍 Inspecting: ${url}\n`);

    try {
      const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      console.log(`   ✅ Status: ${response.status()}`);
      console.log(`   📄 Title: ${await page.title()}`);

      await page.waitForTimeout(5000);

      // Take screenshot
      const filename = url.split('/').filter(Boolean).slice(-2).join('-') || 'home';
      await page.screenshot({
        path: `soulcycle-${filename}.png`,
        fullPage: true
      });
      console.log(`   📸 Screenshot: soulcycle-${filename}.png`);

      // Inspect page structure
      const structure = await page.evaluate(() => {
        // Look for class/schedule elements
        const selectors = [
          '.class',
          '.class-card',
          '.class-item',
          '.session',
          '.ride',
          '.ride-card',
          '[data-testid*="class"]',
          '[class*="Class"]',
          '[class*="class"]',
          '[class*="Ride"]',
          '[class*="ride"]',
          '.schedule',
          '[class*="Schedule"]'
        ];

        const found = {};
        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0 && elements.length < 200) {
            found[selector] = {
              count: elements.length,
              sample: elements[0]?.textContent?.substring(0, 200),
              html: elements[0]?.outerHTML?.substring(0, 300)
            };
          }
        });

        // Check for React/Vue app
        const hasReact = !!document.querySelector('[data-reactroot], #root, #app, [id*="react"]');
        const hasVue = !!document.querySelector('[data-v-]');

        // Look for buttons/links
        const classButtons = Array.from(document.querySelectorAll('button, a')).filter(el => {
          const text = el.textContent?.toLowerCase() || '';
          return text.includes('class') || text.includes('book') || text.includes('reserve') || text.includes('ride');
        });

        return {
          title: document.title,
          url: window.location.href,
          framework: hasReact ? 'React' : hasVue ? 'Vue' : 'Unknown',
          foundSelectors: found,
          classButtons: classButtons.slice(0, 5).map(el => ({
            text: el.textContent?.trim().substring(0, 50),
            tag: el.tagName,
            href: el.getAttribute('href')
          }))
        };
      });

      console.log('\n📋 Page Structure:');
      console.log(JSON.stringify(structure, null, 2));

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }

  console.log('\n\n📡 API Calls Summary:');
  apiCalls.forEach(call => {
    console.log(`   ${call.status} ${call.url}`);
  });

  // Keep browser open for manual inspection
  console.log('\n\n⏳ Browser will stay open for 60 seconds for manual inspection...');
  await new Promise(resolve => setTimeout(resolve, 60000));

  await browser.close();
})();
