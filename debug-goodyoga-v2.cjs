const puppeteer = require('puppeteer');
const fs = require('fs');

console.log('🔍 Good Yoga San Diego - Widget Data Extraction Debug\n');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  console.log('📍 Step 1: Navigate to Good Yoga San Diego');
  await page.goto('https://goodyogasandiego.com/', { waitUntil: 'networkidle0', timeout: 30000 });

  console.log('⏳ Waiting for widget to load...');
  await page.waitForSelector('#bw-widget__schedules-212051', { timeout: 30000 });
  await new Promise(resolve => setTimeout(resolve, 8000));

  console.log('\n📍 Step 2: Extract session data from widget');
  const sessionData = await page.evaluate(() => {
    const sessions = [];
    const widget = document.querySelector('#bw-widget__schedules-212051');

    if (!widget) {
      return { error: 'Widget not found' };
    }

    const sessionElements = widget.querySelectorAll('.bw-session');
    console.log(`Found ${sessionElements.length} .bw-session elements`);

    sessionElements.forEach((session, i) => {
      if (i < 5) { // Only first 5 for debugging
        const data = {
          index: i,
          html: session.innerHTML.substring(0, 500), // First 500 chars of HTML
          classes: session.className,
        };

        // Try different selector combinations
        const selectors = [
          { name: 'bw-session__name', sel: '.bw-session__name' },
          { name: 'bw-session__time', sel: '.bw-session__time' },
          { name: 'bw-session__staff', sel: '.bw-session__staff' },
          { name: 'bw-session__duration', sel: '.bw-session__duration' },
          { name: 'bw-session__availability', sel: '.bw-session__availability' },
          { name: 'bw-session__spots', sel: '.bw-session__spots' },
          { name: 'bw-widget__cta', sel: '.bw-widget__cta' },
          { name: 'bw-session__description', sel: '.bw-session__description' },
        ];

        data.extracted = {};
        selectors.forEach(s => {
          const el = session.querySelector(s.sel);
          data.extracted[s.name] = el ? el.textContent.trim() : 'NOT FOUND';
        });

        sessions.push(data);
      }
    });

    return { sessions, totalFound: sessionElements.length };
  });

  console.log('\n📊 EXTRACTION RESULTS:');
  console.log(`Total sessions found: ${sessionData.totalFound}`);
  console.log('\nFirst 5 sessions:');
  console.log(JSON.stringify(sessionData.sessions, null, 2));

  fs.writeFileSync('goodyoga-debug-v2.json', JSON.stringify(sessionData, null, 2));
  console.log('\n💾 Full data saved to goodyoga-debug-v2.json');

  console.log('\n📸 Taking screenshot...');
  await page.screenshot({ path: 'goodyoga-debug-v2.png', fullPage: true });

  console.log('\n✅ Debug complete!');
  await browser.close();
})();
