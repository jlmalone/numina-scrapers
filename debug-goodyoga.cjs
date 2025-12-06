const puppeteer = require('puppeteer');

console.log('🔍 Good Yoga San Diego - Mindbody/HealCode Discovery\n');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const apiCalls = [];

  // Capture ALL network requests
  page.on('request', request => {
    const url = request.url();
    if (url.includes('mindbody') || url.includes('healcode') || url.includes('widget')) {
      console.log(`📡 REQUEST: ${url}`);
    }
  });

  // Capture ALL JSON responses
  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';

    // Log Mindbody/HealCode related responses
    if (url.includes('mindbody') || url.includes('healcode') || url.includes('widget')) {
      console.log(`✅ RESPONSE: ${url} (${response.status()})`);

      try {
        if (contentType.includes('json')) {
          const body = await response.json();
          apiCalls.push({ url, status: response.status(), body, timestamp: new Date().toISOString() });
          console.log(`  📦 JSON data captured`);
        }
      } catch (e) {
        // Not JSON or failed to parse
      }
    }

    // Check for class schedule data
    if (contentType.includes('json')) {
      try {
        const body = await response.json();

        // Check if this looks like class schedule data
        if (body && (Array.isArray(body.results) || Array.isArray(body.classes) || Array.isArray(body.Sessions))) {
          const data = body.results || body.classes || body.Sessions || body;
          if (data.length > 0 && (data[0].Name || data[0].name || data[0].ClassName)) {
            console.log(`  🎯 FOUND CLASS DATA! ${data.length} classes`);
            console.log(`  📝 Sample class:`, JSON.stringify(data[0]).substring(0, 200));
            apiCalls.push({ url, status: response.status(), body, timestamp: new Date().toISOString() });
          }
        }
      } catch (e) {
        // Not parseable
      }
    }
  });

  console.log('📍 Step 1: Navigate to Good Yoga San Diego homepage');
  await page.goto('https://goodyogasandiego.com/', { waitUntil: 'networkidle0', timeout: 30000 });
  console.log('⏳ Waiting 5 seconds for widgets to load...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('📍 Step 2: Check for HealCode widgets and Mindbody elements');
  const widgetInfo = await page.evaluate(() => {
    // Find HealCode widgets
    const healcodeWidgets = document.querySelectorAll('healcode-widget, [data-healcode], iframe[src*="healcode"], iframe[src*="mindbody"]');

    const widgets = [];
    healcodeWidgets.forEach((widget, i) => {
      const info = {
        index: i,
        tagName: widget.tagName,
        attributes: {}
      };

      // Collect all attributes
      for (let attr of widget.attributes || []) {
        info.attributes[attr.name] = attr.value;
      }

      // If it's an iframe, get the src
      if (widget.tagName === 'IFRAME') {
        info.iframeSrc = widget.src;
      }

      widgets.push(info);
    });

    // Look for Mindbody site ID in scripts
    const scripts = Array.from(document.querySelectorAll('script'));
    const mindbodyScripts = scripts.filter(s =>
      s.textContent.includes('mindbody') ||
      s.textContent.includes('healcode') ||
      s.src.includes('mindbody') ||
      s.src.includes('healcode')
    );

    const scriptInfo = mindbodyScripts.map(s => ({
      src: s.src,
      textContent: s.textContent.substring(0, 500) // First 500 chars
    }));

    return { widgets, scriptInfo };
  });

  console.log(`\n📊 Found ${widgetInfo.widgets.length} HealCode/Mindbody widgets:`);
  widgetInfo.widgets.forEach(w => {
    console.log(`\nWidget #${w.index}:`);
    console.log(`  Tag: ${w.tagName}`);
    console.log(`  Attributes:`, JSON.stringify(w.attributes, null, 2));
    if (w.iframeSrc) {
      console.log(`  Iframe Src: ${w.iframeSrc}`);
    }
  });

  console.log(`\n📜 Found ${widgetInfo.scriptInfo.length} Mindbody-related scripts:`);
  widgetInfo.scriptInfo.forEach((s, i) => {
    console.log(`\nScript #${i}:`);
    if (s.src) console.log(`  Src: ${s.src}`);
    if (s.textContent) console.log(`  Content: ${s.textContent.substring(0, 200)}...`);
  });

  console.log('\n📍 Step 3: Try to find schedule/booking links');
  const scheduleLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a')).filter(a =>
      a.textContent.toLowerCase().includes('schedule') ||
      a.textContent.toLowerCase().includes('book') ||
      a.textContent.toLowerCase().includes('class') ||
      a.href.includes('schedule') ||
      a.href.includes('book')
    );

    return links.map(l => ({
      text: l.textContent.trim().substring(0, 50),
      href: l.href
    }));
  });

  console.log(`\n🔗 Found ${scheduleLinks.length} schedule/booking links:`);
  scheduleLinks.slice(0, 10).forEach(l => {
    console.log(`  "${l.text}" -> ${l.href}`);
  });

  // Try navigating to schedule page if found
  const scheduleLink = scheduleLinks.find(l =>
    l.href.includes('schedule') ||
    l.text.toLowerCase().includes('schedule')
  );

  if (scheduleLink) {
    console.log(`\n📍 Step 4: Navigate to schedule page: ${scheduleLink.href}`);
    await page.goto(scheduleLink.href, { waitUntil: 'networkidle0', timeout: 30000 });
    console.log('⏳ Waiting 10 seconds for schedule to load...\n');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check for iframes again
    const iframes = await page.evaluate(() => {
      const frames = Array.from(document.querySelectorAll('iframe'));
      return frames.map(f => ({
        src: f.src,
        id: f.id,
        className: f.className
      }));
    });

    console.log(`\n📦 Found ${iframes.length} iframes on schedule page:`);
    iframes.forEach(f => {
      console.log(`  Iframe:`, f);
    });
  }

  console.log('\n📸 Taking screenshot...');
  await page.screenshot({ path: 'goodyoga-debug.png', fullPage: true });

  console.log('💾 Saving API calls...');
  require('fs').writeFileSync(
    'goodyoga-api-calls.json',
    JSON.stringify(apiCalls, null, 2)
  );

  console.log('\n📊 API SUMMARY:');
  console.log(`Total API calls captured: ${apiCalls.length}`);

  if (apiCalls.length > 0) {
    console.log('\n🎯 API calls:\n');
    apiCalls.forEach((call, i) => {
      console.log(`${i + 1}. ${call.url}`);
      console.log(`   Status: ${call.status}`);
      console.log(`   Timestamp: ${call.timestamp}`);
      if (call.body) {
        const bodyStr = JSON.stringify(call.body);
        console.log(`   Body (truncated): ${bodyStr.substring(0, 500)}...`);
      }
      console.log('');
    });
  }

  console.log('✅ Debug complete!');
  console.log('📸 Screenshot: goodyoga-debug.png');
  console.log('💾 API calls: goodyoga-api-calls.json');

  await browser.close();
})();
