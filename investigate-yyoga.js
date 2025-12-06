import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Track all network requests
  const requests = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('mariana') || url.includes('class') || url.includes('api')) {
      requests.push({
        url: url,
        method: req.method(),
        headers: req.headers()
      });
    }
  });

  console.log('Navigating to yYoga booking page...');
  await page.goto('https://yyoga.ca/book-a-class/', { waitUntil: 'networkidle2' });

  console.log('Waiting for page to fully load...');
  await page.waitForTimeout(5000);

  // Check for iframes
  const frames = page.frames();
  console.log('\nFound', frames.length, 'frames');

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const url = frame.url();
    console.log(`Frame ${i}: ${url}`);
  }

  console.log('\n=== Captured Mariana Tek API Requests ===');
  const uniqueUrls = [...new Set(requests.map(r => r.url))];
  uniqueUrls.forEach(url => {
    console.log(url);
    const req = requests.find(r => r.url === url);
    if (req && (url.includes('api') || url.includes('class'))) {
      console.log('  Method:', req.method);
      console.log('  Headers:', JSON.stringify(req.headers, null, 2));
    }
  });

  // Try to find the iframe and access its content
  console.log('\n=== Attempting to access iframe content ===');
  const iframeHandle = await page.$('iframe');
  if (iframeHandle) {
    const iframeSrc = await iframeHandle.evaluate(el => el.src);
    console.log('Iframe src:', iframeSrc);

    // Get the frame
    const frame = await iframeHandle.contentFrame();
    if (frame) {
      console.log('Successfully accessed iframe content');

      // Wait a bit more for iframe content to load
      await page.waitForTimeout(3000);

      // Try to find class elements in the iframe
      try {
        const classElements = await frame.$$('[class*="class"]');
        console.log('Found', classElements.length, 'elements with "class" in their class name');
      } catch (err) {
        console.log('Could not find class elements:', err.message);
      }
    }
  } else {
    console.log('No iframe found on the page');
  }

  await browser.close();
  console.log('\n=== Investigation Complete ===');
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
