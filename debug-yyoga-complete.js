import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  console.log('🔍 yYoga Complete Debug - All network activity + DOM inspection\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();

  // Capture ALL network requests (including XHR, fetch, etc.)
  const allRequests = [];
  const allResponses = [];

  page.on('request', req => {
    allRequests.push({
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType(),
      headers: req.headers()
    });
  });

  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';

    try {
      let body = null;

      // Try to get body for JSON and HTML responses
      if (contentType.includes('json')) {
        body = await response.json();
      } else if (contentType.includes('html')) {
        body = await response.text();
      }

      allResponses.push({
        url: url,
        status: response.status(),
        contentType: contentType,
        bodyPreview: body ? (typeof body === 'string' ? body.substring(0, 200) : JSON.stringify(body).substring(0, 200)) : null
      });

      // Log anything that looks promising
      if (url.includes('class') || url.includes('session') || url.includes('schedule') || url.includes('mariana')) {
        console.log(`📡 Interesting: ${url}`);
        if (body) {
          const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
          if (bodyStr.length < 300) {
            console.log(`   Body: ${bodyStr}`);
          } else {
            console.log(`   Body preview: ${bodyStr.substring(0, 300)}...`);
          }
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  });

  // Navigate directly to iframe URL with studio parameter
  console.log('📍 Step 1: Navigate directly to Mariana iframe with Kitsilano selected');
  const iframeUrl = 'https://yyoga.marianaiframes.com/iframe/schedule/daily?location_id=48718';

  await page.goto(iframeUrl, {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  console.log('⏳ Step 2: Wait for schedule to fully load (10 seconds)');
  await new Promise(resolve => setTimeout(resolve, 10000));

  console.log('🔍 Step 3: Inspect DOM for class data');

  // Try to extract data from the page
  const domData = await page.evaluate(() => {
    const result = {
      html: document.body.innerHTML.substring(0, 5000),
      scripts: [],
      classElements: [],
      allText: document.body.innerText.substring(0, 2000)
    };

    // Look for script tags with data
    const scripts = document.querySelectorAll('script');
    scripts.forEach(script => {
      const content = script.textContent || '';
      if (content.includes('class') || content.includes('session') || content.includes('schedule')) {
        result.scripts.push(content.substring(0, 500));
      }
    });

    // Look for elements that might contain class info
    const possibleSelectors = [
      '.class-session',
      '.class-item',
      '[data-class-id]',
      '[class*="session"]',
      '.schedule-item',
      '[class*="class"]'
    ];

    for (const selector of possibleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.classElements.push({
          selector: selector,
          count: elements.length,
          sampleHTML: elements[0]?.outerHTML.substring(0, 300)
        });
      }
    }

    // Check for React/Vue app data
    if (window.__INITIAL_STATE__) {
      result.initialState = JSON.stringify(window.__INITIAL_STATE__).substring(0, 1000);
    }

    if (window.__NUXT__) {
      result.nuxtData = JSON.stringify(window.__NUXT__).substring(0, 1000);
    }

    // Check for any global variables that might contain data
    const keys = Object.keys(window);
    const dataKeys = keys.filter(k =>
      k.toLowerCase().includes('data') ||
      k.toLowerCase().includes('class') ||
      k.toLowerCase().includes('session')
    );

    if (dataKeys.length > 0) {
      result.globalDataKeys = dataKeys;
    }

    return result;
  });

  console.log('\n📊 DOM ANALYSIS:');
  console.log(`Found ${domData.classElements.length} types of class-related elements`);

  if (domData.classElements.length > 0) {
    console.log('\n✅ Class elements found:');
    domData.classElements.forEach(item => {
      console.log(`  - ${item.selector}: ${item.count} elements`);
      console.log(`    Sample: ${item.sampleHTML}...`);
    });
  }

  if (domData.scripts.length > 0) {
    console.log(`\n📜 Found ${domData.scripts.length} scripts with class-related data`);
    domData.scripts.forEach((script, i) => {
      console.log(`\nScript ${i + 1}:\n${script}...`);
    });
  }

  if (domData.globalDataKeys && domData.globalDataKeys.length > 0) {
    console.log(`\n🌐 Global data keys found: ${domData.globalDataKeys.join(', ')}`);
  }

  console.log(`\n📝 Page text sample:\n${domData.allText}...`);

  // Take screenshot
  await page.screenshot({ path: 'yyoga-schedule-loaded.png', fullPage: true });
  console.log('\n📸 Screenshot saved: yyoga-schedule-loaded.png');

  // Save all data
  fs.writeFileSync('yyoga-complete-debug.json', JSON.stringify({
    requests: allRequests,
    responses: allResponses,
    domData: domData
  }, null, 2));
  console.log('💾 Complete debug data saved to yyoga-complete-debug.json');

  console.log('\n🌐 NETWORK SUMMARY:');
  console.log(`Total requests: ${allRequests.length}`);
  console.log(`Total responses: ${allResponses.length}`);

  // Filter for API-like requests
  const apiRequests = allRequests.filter(r =>
    r.url.includes('/api/') ||
    r.url.includes('mariana') ||
    r.url.includes('class') ||
    r.url.includes('session')
  );

  if (apiRequests.length > 0) {
    console.log(`\n🎯 API-like requests (${apiRequests.length}):`);
    apiRequests.forEach(req => {
      console.log(`  ${req.method} ${req.url}`);
    });
  }

  console.log('\n✅ Complete debug finished!');
  await new Promise(resolve => setTimeout(resolve, 3000));
  await browser.close();
})().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
