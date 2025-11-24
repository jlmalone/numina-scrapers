import puppeteer from 'puppeteer';

const url = 'https://www.equinox.com/clubs/canada/vancouver/westgeorgiast';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Listen for API responses
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/groupfitness/classes/allclasses')) {
      try {
        const data = await response.json();
        if (data.classes && data.classes[0]) {
          console.log('='.repeat(80));
          console.log('EQUINOX API RESPONSE - First Class Object');
          console.log('='.repeat(80));
          console.log('\nAvailable fields:');
          console.log(Object.keys(data.classes[0]).sort().join(', '));
          console.log('\nFirst class full data:');
          console.log(JSON.stringify(data.classes[0], null, 2));
          console.log('\n' + '='.repeat(80));

          // Look for ID fields
          console.log('\nID-related fields:');
          Object.keys(data.classes[0]).forEach(key => {
            if (key.toLowerCase().includes('id') || key.toLowerCase().includes('instance')) {
              console.log(`  ${key}: ${data.classes[0][key]}`);
            }
          });
        }
      } catch (e) {
        // Not JSON
      }
    }
  });

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  await browser.close();
  console.log('\nDone!');
})();
