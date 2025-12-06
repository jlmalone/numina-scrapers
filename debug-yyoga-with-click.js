import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  console.log('🔍 yYoga Final Debug - Click within iframe to load schedule\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();

  // Track all API calls
  const apiCalls = [];

  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';

    if (contentType.includes('json') && url.includes('mariana')) {
      try {
        const body = await response.json();
        apiCalls.push({
          url: url,
          status: response.status(),
          body: body,
          timestamp: new Date().toISOString()
        });

        console.log(`📡 API: ${url.substring(0, 80)}...`);

        // Check if this looks like class data
        if (body.results || body.class_sessions || body.sessions || body.classes) {
          const data = body.results || body.class_sessions || body.sessions || body.classes;
          if (Array.isArray(data) && data.length > 0) {
            console.log(`  ✅ FOUND SCHEDULE DATA! ${data.length} items`);
            console.log(`  📝 First item keys: ${Object.keys(data[0]).join(', ')}`);
          }
        }
      } catch (e) {
        // Not JSON or can't parse
      }
    }
  });

  console.log('📍 Step 1: Navigate directly to Mariana iframe');
  await page.goto('https://yyoga.marianaiframes.com/iframe/schedule/daily', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  console.log('⏳ Step 2: Wait for iframe to fully load (5 seconds)');
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('🖱️  Step 3: Click "Kitsilano" studio button');

  try {
    // Find and click the Kitsilano button
    const clicked = await page.evaluate(() => {
      // Look for any element containing "Kitsilano"
      const allElements = Array.from(document.querySelectorAll('*'));

      for (const el of allElements) {
        const text = el.textContent || '';

        // Look for Kitsilano text in a clickable element
        if (text.includes('Kitsilano')) {
          // Check if this is a button, link, or clickable div
          const tagName = el.tagName.toLowerCase();
          const role = el.getAttribute('role');

          if (tagName === 'button' ||
              tagName === 'a' ||
              role === 'button' ||
              el.onclick ||
              window.getComputedStyle(el).cursor === 'pointer') {

            console.log(`Found clickable Kitsilano element: ${tagName}`);
            el.click();
            return true;
          }

          // Try parent element
          const parent = el.parentElement;
          if (parent) {
            const parentTag = parent.tagName.toLowerCase();
            const parentRole = parent.getAttribute('role');

            if (parentTag === 'button' ||
                parentTag === 'a' ||
                parentRole === 'button' ||
                parent.onclick ||
                window.getComputedStyle(parent).cursor === 'pointer') {

              console.log(`Found clickable parent of Kitsilano: ${parentTag}`);
              parent.click();
              return true;
            }
          }
        }
      }

      // If we can't find a proper clickable, just click any element with "Kitsilano"
      for (const el of allElements) {
        const text = el.textContent || '';
        if (text.includes('Kitsilano') && text.length < 100) {
          console.log(`Clicking fallback Kitsilano element`);
          el.click();
          return true;
        }
      }

      return false;
    });

    if (clicked) {
      console.log('  ✅ Clicked Kitsilano studio');
    } else {
      console.log('  ❌ Could not find Kitsilano button to click');
    }
  } catch (error) {
    console.log(`  ❌ Error clicking: ${error.message}`);
  }

  console.log('⏳ Step 4: Wait for schedule to load (15 seconds)');
  await new Promise(resolve => setTimeout(resolve, 15000));

  console.log('🔍 Step 5: Check if schedule loaded in DOM');

  const scheduleData = await page.evaluate(() => {
    const result = {
      bodyText: document.body.innerText.substring(0, 1000),
      classSelectors: []
    };

    // Look for common class schedule selectors
    const selectors = [
      '[class*="class"]',
      '[class*="session"]',
      '[class*="schedule"]',
      '[data-class-id]',
      'button',
      'a'
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        const sample = elements[0];
        result.classSelectors.push({
          selector: selector,
          count: elements.length,
          sampleText: sample.textContent?.substring(0, 100)
        });
      }
    }

    return result;
  });

  console.log('\n📝 Page content after click:');
  console.log(scheduleData.bodyText);

  if (scheduleData.classSelectors.length > 0) {
    console.log('\n📊 Found elements:');
    scheduleData.classSelectors.forEach(item => {
      if (item.count < 100) {  // Only show reasonable counts
        console.log(`  ${item.selector}: ${item.count} elements`);
        if (item.sampleText) {
          console.log(`    Sample: "${item.sampleText}"`);
        }
      }
    });
  }

  // Take screenshot
  await page.screenshot({ path: 'yyoga-after-click.png', fullPage: true });
  console.log('\n📸 Screenshot saved: yyoga-after-click.png');

  // Save all API calls
  fs.writeFileSync('yyoga-api-after-click.json', JSON.stringify(apiCalls, null, 2));
  console.log(`💾 Saved ${apiCalls.length} API calls to yyoga-api-after-click.json`);

  console.log('\n📊 API SUMMARY:');
  console.log(`Total API calls captured: ${apiCalls.length}`);

  if (apiCalls.length > 0) {
    console.log('\n🎯 API calls:');
    apiCalls.forEach((call, i) => {
      console.log(`\n${i + 1}. ${call.url}`);
      console.log(`   Status: ${call.status}`);
      console.log(`   Timestamp: ${call.timestamp}`);

      if (call.body) {
        const bodyStr = JSON.stringify(call.body);
        if (bodyStr.length < 500) {
          console.log(`   Body: ${bodyStr}`);
        } else {
          console.log(`   Body (truncated): ${bodyStr.substring(0, 500)}...`);
        }
      }
    });
  }

  console.log('\n✅ Debug complete!');
  await new Promise(resolve => setTimeout(resolve, 3000));
  await browser.close();
})().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
