import puppeteer from 'puppeteer';

// Common facility IDs to test (based on patterns found)
const testFacilities = [
  { name: 'Vancouver West Georgia', id: 860 },
  { name: 'New York Hudson Yards', id: 138 },
  { name: 'Los Angeles Century City', id: 129 },
  { name: 'San Francisco Market Street', id: 102 },
  { name: 'Chicago Lincoln Park', id: 114 },
  { name: 'Miami Beach', id: 130 },
  { name: 'Boston Back Bay', id: 103 },
  { name: 'DC Downtown', id: 117 }
];

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  console.log('🔍 Testing Equinox Facility IDs...\n');

  for (const facility of testFacilities) {
    try {
      // Navigate to establish session
      await page.goto('https://www.equinox.com/clubs', { waitUntil: 'networkidle0' });

      // Make API request
      const result = await page.evaluate(async (apiUrl, facilityId, facilityName) => {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              startDate: '2025-11-24',
              endDate: '2025-12-01',
              facilityIds: [facilityId],
              isBookingRequired: false
            })
          });

          if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
          }

          const data = await response.json();
          return {
            success: true,
            classCount: data.classes?.length || 0,
            firstClass: data.classes?.[0]?.name || 'N/A'
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }, 'https://api.equinox.com/v6/groupfitness/classes/allclasses', facility.id, facility.name);

      if (result.success) {
        console.log(`✅ ${facility.name} (ID: ${facility.id})`);
        console.log(`   Classes found: ${result.classCount}`);
        console.log(`   Sample: ${result.firstClass}\n`);
      } else {
        console.log(`❌ ${facility.name} (ID: ${facility.id}) - ${result.error}\n`);
      }

    } catch (error) {
      console.log(`❌ ${facility.name} (ID: ${facility.id}) - Error: ${error.message}\n`);
    }
  }

  await browser.close();
  console.log('✅ Test complete!');
})();
