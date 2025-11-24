import puppeteer from 'puppeteer';
import fs from 'fs';

const url = 'https://www.equinox.com/clubs/new-york-ny/schedule';

(async () => {
  console.log(`\n🔍 Inspecting Equinox Website: ${url}\n`);

  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: ['--window-size=1920,1080']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Monitor network calls
  const apiCalls = [];
  page.on('response', async response => {
    const url = response.url();
    if (
      url.includes('api') ||
      url.includes('graphql') ||
      url.includes('schedule') ||
      url.includes('class')
    ) {
      console.log(`📡 API Call: ${url}`);
      apiCalls.push({
        url,
        status: response.status(),
        contentType: response.headers()['content-type']
      });

      try {
        if (response.headers()['content-type']?.includes('json')) {
          const data = await response.json();
          const preview = JSON.stringify(data).substring(0, 500);
          console.log(`   Response preview: ${preview}...`);

          // Save full response if it looks promising
          if (data && (data.classes || data.schedule || data.data)) {
            fs.writeFileSync(
              'equinox-api-response.json',
              JSON.stringify(data, null, 2)
            );
            console.log(`   ✅ Saved full response to equinox-api-response.json`);
          }
        }
      } catch (e) {
        // Not JSON or failed to parse
      }
    }
  });

  try {
    console.log('📄 Navigating to page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('⏳ Waiting for content to load (10 seconds)...');
    await page.waitForTimeout(10000);

    // Take screenshot
    await page.screenshot({ path: 'equinox-current.png', fullPage: true });
    console.log('📸 Screenshot saved: equinox-current.png');

    // Save page HTML
    const html = await page.content();
    fs.writeFileSync('equinox-current.html', html);
    console.log('💾 HTML saved: equinox-current.html');

    // Inspect page structure
    const structure = await page.evaluate(() => {
      // Function to get class name patterns
      const getAllClassNames = () => {
        const classNames = new Set();
        document.querySelectorAll('*').forEach(el => {
          if (el.className && typeof el.className === 'string') {
            el.className.split(' ').forEach(cls => {
              if (cls.toLowerCase().includes('schedule') ||
                  cls.toLowerCase().includes('class') ||
                  cls.toLowerCase().includes('session')) {
                classNames.add(cls);
              }
            });
          }
        });
        return Array.from(classNames);
      };

      // Look for potential schedule containers
      const potentialContainers = [
        '.schedule',
        '.schedule-container',
        '.class-schedule',
        '.classes',
        '.class-list',
        '[class*="schedule"]',
        '[class*="Schedule"]',
        '[class*="class-card"]',
        '[class*="ClassCard"]',
        '[data-testid*="schedule"]',
        '[data-testid*="class"]'
      ];

      const foundContainers = {};
      potentialContainers.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          foundContainers[selector] = {
            count: elements.length,
            samples: Array.from(elements).slice(0, 2).map(el => ({
              tagName: el.tagName,
              className: el.className,
              id: el.id,
              dataAttributes: Array.from(el.attributes)
                .filter(attr => attr.name.startsWith('data-'))
                .map(attr => `${attr.name}="${attr.value}"`),
              textPreview: el.textContent?.substring(0, 100)
            }))
          };
        }
      });

      // Check for React/Vue
      const framework = document.querySelector('[data-reactroot], #root, #__next')
        ? 'React'
        : document.querySelector('[data-v-]')
        ? 'Vue'
        : 'Unknown';

      // Look for script tags with data
      const scriptData = Array.from(document.querySelectorAll('script'))
        .filter(s => s.textContent && !s.src)
        .map(s => s.textContent.substring(0, 200))
        .filter(t => t.includes('schedule') || t.includes('class'));

      return {
        title: document.title,
        framework,
        relevantClassNames: getAllClassNames().slice(0, 50),
        foundContainers,
        scriptDataSamples: scriptData.slice(0, 3),
        bodyStructure: {
          totalElements: document.querySelectorAll('*').length,
          mainContainers: Array.from(document.querySelectorAll('main, #main, .main, [role="main"]'))
            .map(el => ({ tagName: el.tagName, className: el.className, id: el.id }))
        }
      };
    });

    console.log('\n📊 Page Structure Analysis:');
    console.log(JSON.stringify(structure, null, 2));

    fs.writeFileSync('equinox-structure.json', JSON.stringify(structure, null, 2));
    console.log('\n💾 Structure saved: equinox-structure.json');

    console.log('\n📡 API Calls Summary:');
    apiCalls.forEach(call => {
      console.log(`   ${call.status} ${call.url}`);
    });

    fs.writeFileSync('equinox-api-calls.json', JSON.stringify(apiCalls, null, 2));
    console.log('\n💾 API calls saved: equinox-api-calls.json');

    console.log('\n\n⏳ Browser will stay open for 60 seconds for manual inspection...');
    console.log('   Check the DevTools to see the page structure');
    console.log('   Look for class listings, schedule containers, etc.\n');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('❌ Error:', error.message);
    await page.screenshot({ path: 'equinox-error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('\n✅ Inspection complete');
    console.log('\nGenerated files:');
    console.log('   - equinox-current.png (screenshot)');
    console.log('   - equinox-current.html (page HTML)');
    console.log('   - equinox-structure.json (page structure analysis)');
    console.log('   - equinox-api-calls.json (network activity)');
    if (fs.existsSync('equinox-api-response.json')) {
      console.log('   - equinox-api-response.json (API response data)');
    }
  }
})();
