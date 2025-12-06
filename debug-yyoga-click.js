import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  console.log('🔍 yYoga Click Debug - Finding the class data API...\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();

  // Capture ALL network requests
  const apiCalls = [];
  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';

    // Log all JSON responses
    if (contentType.includes('json')) {
      try {
        const body = await response.json();
        apiCalls.push({
          url: url,
          status: response.status(),
          body: body
        });

        console.log(`📡 JSON API: ${url.substring(0, 100)}...`);

        // Check if this looks like class data
        if (body && (Array.isArray(body.results) || Array.isArray(body.class_sessions) || Array.isArray(body))) {
          const data = body.results || body.class_sessions || body;
          if (data.length > 0 && data[0].name) {
            console.log(`  ✅ FOUND CLASS DATA! ${data.length} items`);
            console.log(`  📝 Sample: ${JSON.stringify(data[0], null, 2).substring(0, 200)}...`);
          }
        }
      } catch (e) {
        // Not JSON or can't parse
      }
    }
  });

  console.log('📍 Step 1: Navigate to yYoga booking page');
  await page.goto('https://yyoga.ca/book-a-class/', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  console.log('⏳ Step 2: Wait for page to load');
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('🖼️  Step 3: Find and access Mariana Tek iframe');
  const frames = page.frames();
  let marianaFrame = null;

  for (const frame of frames) {
    if (frame.url().includes('marianaiframes.com')) {
      marianaFrame = frame;
      console.log(`  ✅ Found Mariana frame: ${frame.url()}`);
      break;
    }
  }

  if (!marianaFrame) {
    console.log('  ❌ No Mariana frame found!');
    await browser.close();
    return;
  }

  console.log('🔍 Step 4: Look for studio buttons in iframe');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Try to find and click a studio button
  try {
    // Look for elements containing "Kitsilano" or "Downtown"
    const studioClicked = await marianaFrame.evaluate(() => {
      const allElements = document.querySelectorAll('*');

      for (const el of allElements) {
        const text = el.textContent || '';
        if (text.includes('Kitsilano') && text.length < 200) {
          // This might be a studio button
          const clickable = el;
          if (clickable) {
            clickable.click();
            return true;
          }
        }
      }

      return false;
    });

    if (studioClicked) {
      console.log('  ✅ Clicked on Kitsilano studio');
    } else {
      console.log('  ⚠️  Could not find clickable studio element');
    }
  } catch (error) {
    console.log(`  ❌ Error clicking: ${error.message}`);
  }

  console.log('⏳ Step 5: Wait for schedule to load (15 seconds)');
  await new Promise(resolve => setTimeout(resolve, 15000));

  console.log('\n📊 API CALLS SUMMARY:');
  console.log(`Total JSON API calls captured: ${apiCalls.length}`);

  // Save all API calls
  fs.writeFileSync('yyoga-api-calls.json', JSON.stringify(apiCalls, null, 2));
  console.log('💾 Saved all API calls to yyoga-api-calls.json');

  // Find class-related APIs
  const classApis = apiCalls.filter(call =>
    call.url.includes('class') || call.url.includes('session') || call.url.includes('schedule')
  );

  if (classApis.length > 0) {
    console.log(`\n🎯 Found ${classApis.length} potential class-related APIs:`);
    classApis.forEach((api, i) => {
      console.log(`\n${i + 1}. ${api.url}`);
      const bodyStr = JSON.stringify(api.body);
      if (bodyStr.length < 300) {
        console.log(`   Body: ${bodyStr}`);
      } else {
        console.log(`   Body: ${bodyStr.substring(0, 300)}...`);
      }
    });
  }

  console.log('\n✅ Debug complete!');
  console.log('Check yyoga-api-calls.json for full details');

  await new Promise(resolve => setTimeout(resolve, 5000));
  await browser.close();
})().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
