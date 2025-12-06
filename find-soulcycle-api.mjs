// find-soulcycle-api.mjs - Find Soul Cycle's actual API endpoints
import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const apiCalls = [];

  // Capture ALL network requests
  page.on('request', request => {
    const url = request.url();
    if (url.includes('soul') || url.includes('class') || url.includes('schedule') || url.includes('studio')) {
      console.log('📤 REQUEST:', request.method(), url);
    }
  });

  page.on('response', async response => {
    const url = response.url();

    // Look for SoulCycle-specific APIs
    if (url.includes('soul-cycle.com') &&
        (url.includes('api') || url.includes('schedule') || url.includes('class') || url.includes('studio'))) {

      console.log('\n🎯 FOUND SOULCYCLE API:', url);
      console.log('   Status:', response.status());
      console.log('   Type:', response.headers()['content-type']);

      try {
        const data = await response.json();
        console.log('   Data preview:', JSON.stringify(data).substring(0, 200));

        // Save full response
        const filename = `soulcycle-api-${Date.now()}.json`;
        fs.writeFileSync(filename, JSON.stringify({
          url,
          status: response.status(),
          headers: response.headers(),
          data
        }, null, 2));
        console.log(`   ✅ Saved to: ${filename}\n`);

        apiCalls.push({ url, data });
      } catch (e) {
        console.log(`   ⚠️  Not JSON or error: ${e.message}\n`);
      }
    }
  });

  // Test different URLs
  const testUrls = [
    'https://www.soul-cycle.com/studios/ny-newyork-nomad/',
    'https://www.soul-cycle.com/find-a-class/studio/20/',
  ];

  for (const url of testUrls) {
    console.log(`\n\n${'='.repeat(80)}`);
    console.log(`🔍 Testing: ${url}`);
    console.log('='.repeat(80) + '\n');

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      console.log('✅ Page loaded:', await page.title());

      // Wait for any lazy-loaded content
      await page.waitForTimeout(5000);

      // Try to find and click a "schedule" or "book" button
      const scheduleButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const scheduleBtn = buttons.find(btn => {
          const text = btn.textContent?.toLowerCase() || '';
          return text.includes('schedule') || text.includes('book') || text.includes('class') || text.includes('find');
        });
        if (scheduleBtn) {
          scheduleBtn.click();
          return scheduleBtn.textContent;
        }
        return null;
      });

      if (scheduleButton) {
        console.log(`\n🔘 Clicked button: "${scheduleButton}"`);
        await page.waitForTimeout(3000);
      }

    } catch (error) {
      console.log('❌ Error:', error.message);
    }
  }

  console.log(`\n\n${'='.repeat(80)}`);
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Found ${apiCalls.length} SoulCycle API calls`);

  if (apiCalls.length > 0) {
    console.log('\nAPI Endpoints discovered:');
    apiCalls.forEach((call, i) => {
      console.log(`  ${i + 1}. ${call.url}`);
    });
  } else {
    console.log('\n⚠️  No SoulCycle API endpoints found.');
    console.log('This suggests:');
    console.log('  1. Schedule data may be server-side rendered in HTML');
    console.log('  2. API endpoints use different naming conventions');
    console.log('  3. May need authentication/cookies to access schedule');
  }

  await browser.close();
  process.exit(0);
})();
