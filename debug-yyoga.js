import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  console.log('🔍 Starting yYoga debug session...\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();

  // Capture network requests
  const requests = [];
  page.on('request', req => {
    if (req.url().includes('mariana') || req.url().includes('class') || req.url().includes('api')) {
      requests.push({
        url: req.url(),
        method: req.method(),
        resourceType: req.resourceType()
      });
    }
  });

  // Capture responses
  const responses = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('mariana') || url.includes('class') || url.includes('api')) {
      try {
        const contentType = response.headers()['content-type'] || '';
        let body = null;

        if (contentType.includes('json')) {
          try {
            body = await response.json();
          } catch (e) {
            body = await response.text();
          }
        }

        responses.push({
          url: url,
          status: response.status(),
          contentType: contentType,
          body: body
        });
      } catch (e) {
        // Ignore errors
      }
    }
  });

  console.log('📍 Navigating to yYoga Kitsilano...');
  await page.goto('https://yyoga.ca/book-a-class/?studio=kitsilano', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  console.log('⏳ Waiting 10 seconds for content to load...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Take screenshot
  await page.screenshot({ path: 'yyoga-kitsilano-debug.png', fullPage: true });
  console.log('📸 Screenshot saved: yyoga-kitsilano-debug.png');

  // Get all frames
  const frames = page.frames();
  console.log(`\n🖼️  Found ${frames.length} frames:`);
  frames.forEach((frame, i) => {
    console.log(`  Frame ${i}: ${frame.url()}`);
  });

  // Try to access iframe content
  console.log('\n🔍 Attempting to access iframe content...');
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (frame.url().includes('mariana')) {
      console.log(`\n  📋 Mariana frame found: ${frame.url()}`);

      try {
        // Wait for potential content
        await frame.waitForSelector('body', { timeout: 5000 });

        // Get frame HTML
        const frameHtml = await frame.content();
        fs.writeFileSync(`mariana-frame-${i}.html`, frameHtml);
        console.log(`  💾 Saved frame HTML to mariana-frame-${i}.html`);

        // Try to find class elements
        const classData = await frame.evaluate(() => {
          const data = {
            allDivs: document.querySelectorAll('div').length,
            allButtons: document.querySelectorAll('button').length,
            allLinks: document.querySelectorAll('a').length,
            dataAttributes: [],
            classNames: new Set()
          };

          // Get all elements with data attributes
          const elementsWithData = document.querySelectorAll('[data-class], [data-session], [class*="class"], [class*="session"]');
          elementsWithData.forEach(el => {
            const attrs = {};
            el.getAttributeNames().forEach(attr => {
              if (attr.startsWith('data-')) {
                attrs[attr] = el.getAttribute(attr);
              }
            });
            if (Object.keys(attrs).length > 0) {
              data.dataAttributes.push(attrs);
            }

            // Collect class names
            if (el.className) {
              el.className.split(' ').forEach(cls => {
                if (cls.includes('class') || cls.includes('session') || cls.includes('schedule')) {
                  data.classNames.add(cls);
                }
              });
            }
          });

          data.classNames = Array.from(data.classNames);

          // Look for any text that might be class names
          const bodyText = document.body.innerText;
          data.hasYogaText = bodyText.includes('Yoga') || bodyText.includes('yoga');
          data.textSample = bodyText.substring(0, 500);

          return data;
        });

        console.log('  📊 Frame analysis:');
        console.log(`    - Divs: ${classData.allDivs}`);
        console.log(`    - Buttons: ${classData.allButtons}`);
        console.log(`    - Links: ${classData.allLinks}`);
        console.log(`    - Has Yoga text: ${classData.hasYogaText}`);
        console.log(`    - Class names found: ${classData.classNames.length}`);
        console.log(`    - Data attributes found: ${classData.dataAttributes.length}`);

        if (classData.classNames.length > 0) {
          console.log(`    - Sample class names: ${classData.classNames.slice(0, 5).join(', ')}`);
        }

        if (classData.textSample) {
          console.log(`    - Text sample: "${classData.textSample.substring(0, 200)}..."`);
        }

      } catch (error) {
        console.log(`  ❌ Error accessing frame: ${error.message}`);
      }
    }
  }

  // Save network requests/responses
  console.log('\n🌐 Network Activity:');
  console.log(`  - Captured ${requests.length} relevant requests`);
  console.log(`  - Captured ${responses.length} relevant responses`);

  if (responses.length > 0) {
    console.log('\n  📡 API Responses:');
    responses.forEach((resp, i) => {
      console.log(`    ${i + 1}. ${resp.url}`);
      console.log(`       Status: ${resp.status}, Type: ${resp.contentType}`);

      if (resp.body && typeof resp.body === 'object') {
        const bodyStr = JSON.stringify(resp.body, null, 2);
        if (bodyStr.length < 500) {
          console.log(`       Body: ${bodyStr}`);
        } else {
          console.log(`       Body: ${bodyStr.substring(0, 500)}...`);
          fs.writeFileSync(`response-${i}.json`, bodyStr);
          console.log(`       💾 Full body saved to response-${i}.json`);
        }
      }
    });
  }

  // Dump main page HTML
  const mainHtml = await page.content();
  fs.writeFileSync('yyoga-main-page.html', mainHtml);
  console.log('\n💾 Main page HTML saved to yyoga-main-page.html');

  console.log('\n✅ Debug session complete!');
  console.log('📁 Files created:');
  console.log('   - yyoga-kitsilano-debug.png');
  console.log('   - yyoga-main-page.html');
  console.log('   - mariana-frame-*.html (if found)');
  console.log('   - response-*.json (if API calls found)');

  await browser.close();
})().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
