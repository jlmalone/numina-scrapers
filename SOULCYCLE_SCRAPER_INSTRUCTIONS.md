# SoulCycle Scraper Instructions for Claude Agent

## Mission
Create or fix the SoulCycle scraper to fetch cycling class schedules from SoulCycle studios across major cities.

## Why SoulCycle is Valuable
SoulCycle is one of the most popular boutique fitness brands with:
- 90+ studios across major US cities
- High-intensity cycling classes with cult following
- Celebrity instructors with loyal followings
- Premium pricing and exclusive community
- Consistent class schedule format

## Current Status
- Provider status: **UNKNOWN** - Need to check if exists
- Last known working: Unknown
- Expected data: 50-200 classes per major city

## Project Location
```bash
cd ~/IdeaProjects/numina-scrapers
```

## Step 1: Check Current Implementation

### Check if SoulCycle Provider Exists
```bash
cd ~/IdeaProjects/numina-scrapers

# Look for existing provider
ls -la src/providers/ | grep -i soul

# Check provider config
cat config/providers.json | grep -i soul
```

**If provider exists:**
- Read the current implementation
- Identify why it's broken
- Fix the broken selectors/logic

**If provider doesn't exist:**
- Create new provider from scratch
- Use BaseProvider as template
- Follow patterns from working providers

## Step 2: Inspect SoulCycle Website

### Primary URLs to Test
**Schedule Page:** https://www.soul-cycle.com/find-a-class/
**Studio Page:** https://www.soul-cycle.com/studios/newyork/tribeca/

### Create Inspection Script

```javascript
// Save as: inspect-soulcycle.js
import puppeteer from 'puppeteer';

const urls = [
  'https://www.soul-cycle.com/find-a-class/',
  'https://www.soul-cycle.com/studios/newyork/tribeca/'
];

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true
  });

  for (const url of urls) {
    console.log(`\n\n🔍 Inspecting: ${url}\n`);

    const page = await browser.newPage();

    // Monitor API calls
    const apiCalls = [];
    page.on('response', async response => {
      const url = response.url();
      if (
        url.includes('api') ||
        url.includes('class') ||
        url.includes('schedule') ||
        url.includes('graphql')
      ) {
        console.log('   📡 API Call:', url);
        apiCalls.push({
          url,
          status: response.status(),
          contentType: response.headers()['content-type']
        });

        try {
          if (url.includes('json') || response.headers()['content-type']?.includes('json')) {
            const data = await response.json();
            console.log('   📦 Response preview:', JSON.stringify(data).substring(0, 300));
          }
        } catch (e) {
          // Not JSON or failed to parse
        }
      }
    });

    try {
      await page.goto(url, { waitUntil: 'networkidle0' });
      await page.waitForTimeout(5000);

      // Take screenshot
      const filename = url.split('/').filter(Boolean).pop() || 'home';
      await page.screenshot({
        path: `soulcycle-${filename}.png`,
        fullPage: true
      });

      // Inspect page structure
      const structure = await page.evaluate(() => {
        // Look for class elements
        const selectors = [
          '.class',
          '.class-card',
          '.class-item',
          '.session',
          '[data-testid*="class"]',
          '[class*="Class"]',
          '[class*="class"]',
          '.schedule-item'
        ];

        const found = {};
        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            found[selector] = {
              count: elements.length,
              sample: elements[0]?.textContent?.substring(0, 150)
            };
          }
        });

        // Check for React/Vue app
        const hasReact = !!document.querySelector('[data-reactroot], #root, #app');
        const hasVue = !!document.querySelector('[data-v-]');

        // Look for schedule data in scripts
        const scripts = Array.from(document.querySelectorAll('script'));
        const dataScripts = scripts
          .filter(s => s.textContent?.includes('schedule') || s.textContent?.includes('class'))
          .map(s => s.textContent?.substring(0, 200));

        return {
          title: document.title,
          url: window.location.href,
          framework: hasReact ? 'React' : hasVue ? 'Vue' : 'Unknown',
          foundSelectors: found,
          potentialDataScripts: dataScripts.slice(0, 3)
        };
      });

      console.log('\n📋 Page Structure:');
      console.log(JSON.stringify(structure, null, 2));

      console.log('\n📡 API Calls Summary:');
      apiCalls.forEach(call => {
        console.log(`   ${call.status} ${call.url}`);
      });

    } catch (error) {
      console.error('   ❌ Error:', error.message);
    }

    await page.close();
  }

  // Keep browser open for manual inspection
  console.log('\n\n⏳ Browser will stay open for 60 seconds for manual inspection...');
  await new Promise(resolve => setTimeout(resolve, 60000));

  await browser.close();
})();
```

Run it:
```bash
cd ~/IdeaProjects/numina-scrapers
node inspect-soulcycle.js > soulcycle-structure.json
```

## Step 3: Identify Data Source

SoulCycle likely uses one of these patterns:

### Option A: REST API
Look for endpoints like:
- `https://api.soul-cycle.com/classes`
- `https://www.soul-cycle.com/api/v1/classes`
- `https://www.soul-cycle.com/api/schedule`

### Option B: GraphQL API
Look for:
- `https://api.soul-cycle.com/graphql`
- POST requests with GraphQL queries

### Option C: Server-Side Rendered HTML
- Class data embedded in initial HTML
- Extract from DOM elements

### Option D: JavaScript Bundle with Data
- Schedule data in `<script>` tags
- Extract from `window.__INITIAL_STATE__` or similar

## Step 4: Authentication Analysis

SoulCycle may require login to see full schedules.

### Check Authentication Requirements

**Test 1: Can you see classes without login?**
```javascript
// In inspection script, check if classes visible
const classesVisible = await page.evaluate(() => {
  const classes = document.querySelectorAll('.class, .class-card');
  return classes.length > 0;
});

const loginRequired = await page.evaluate(() => {
  return !!document.querySelector('[data-testid="login"], .login-modal, #login');
});
```

### If Login Required: Authentication Strategy

**Option A: Session Cookies**
```typescript
async authenticate(page: Page): Promise<void> {
  // Load saved cookies
  const cookies = JSON.parse(
    fs.readFileSync('soulcycle-cookies.json', 'utf-8')
  );
  await page.setCookie(...cookies);
}
```

**Option B: Automated Login**
```typescript
async login(page: Page): Promise<void> {
  await page.goto('https://www.soul-cycle.com/login');

  await page.type('#email', process.env.SOULCYCLE_EMAIL);
  await page.type('#password', process.env.SOULCYCLE_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: 'networkidle0' });

  // Save cookies for reuse
  const cookies = await page.cookies();
  fs.writeFileSync('soulcycle-cookies.json', JSON.stringify(cookies));
}
```

**Option C: Public API Access**
If SoulCycle has public schedule pages, use those directly without auth.

## Step 5: Data Model

Map SoulCycle classes to this structure:

```typescript
interface SoulCycleClass {
  // Basic Info
  name: string;                    // "SoulCycle"
  instructor: string;              // "Angela Davis"
  studio: string;                  // "Tribeca"
  city: string;                    // "New York"

  // Time
  startTime: string;               // ISO 8601
  duration: number;                // Usually 45 or 60 minutes

  // Booking
  bookingUrl: string;              // Direct booking link
  spotsAvailable: number;
  spotsTotal: number;

  // Pricing
  credits: number;                 // SoulCycle uses credit system
  price?: number;                  // If available

  // Enhanced
  difficulty?: string;             // "All Levels", "Advanced", etc.
  bikeType?: string;               // Regular or SPINPower
  music?: string;                  // Music genre/theme
  description?: string;
}
```

## Step 6: Create or Update Provider

### If Creating New Provider

```typescript
// Save as: src/providers/SoulCycleProvider.ts
import { BaseProvider } from './BaseProvider';
import type { FitnessClass, ScrapeOptions } from '../types';
import { Page } from 'puppeteer';

export class SoulCycleProvider extends BaseProvider {
  constructor() {
    super('soulcycle', 'SoulCycle');
  }

  async scrapeClasses(options: ScrapeOptions): Promise<FitnessClass[]> {
    const classes: FitnessClass[] = [];
    const page = await this.browser!.newPage();

    try {
      // 1. Handle authentication if needed
      if (this.requiresAuth()) {
        await this.authenticate(page);
      }

      // 2. Navigate to schedule page
      const url = this.buildScheduleUrl(options);
      await page.goto(url, { waitUntil: 'networkidle0' });

      // 3. Wait for classes to load
      await page.waitForSelector('.class-card', { timeout: 30000 });

      // 4. Extract class data
      const classData = await this.extractClasses(page);

      // 5. Transform to standard format
      for (const data of classData) {
        classes.push(this.transformToFitnessClass(data));
      }

    } catch (error) {
      this.logger.error(`SoulCycle scraping error: ${error}`);
      throw error;
    } finally {
      await page.close();
    }

    return classes;
  }

  private buildScheduleUrl(options: ScrapeOptions): string {
    // Default to NYC if no location specified
    const location = options.location || 'newyork/tribeca';
    return `https://www.soul-cycle.com/studios/${location}/`;
  }

  private async extractClasses(page: Page): Promise<any[]> {
    return await page.evaluate(() => {
      const classes: any[] = [];
      const classElements = document.querySelectorAll('.class-card');

      classElements.forEach(el => {
        classes.push({
          instructor: el.querySelector('.instructor-name')?.textContent?.trim(),
          time: el.querySelector('.class-time')?.textContent?.trim(),
          duration: el.querySelector('.duration')?.textContent?.trim(),
          spotsAvailable: el.querySelector('.spots-available')?.textContent?.trim(),
          bookingUrl: el.querySelector('a.book-btn')?.getAttribute('href'),
          // Add more fields as needed
        });
      });

      return classes;
    });
  }

  private transformToFitnessClass(data: any): FitnessClass {
    return {
      name: 'SoulCycle',
      description: `High-energy indoor cycling class`,
      classType: 'cycling',
      startTime: this.parseTime(data.time),
      endTime: this.calculateEndTime(data.time, data.duration),
      duration: this.parseDuration(data.duration),
      location: {
        name: 'SoulCycle',
        address: '', // Extract from page
      },
      trainer: {
        name: data.instructor,
      },
      provider: {
        id: 'soulcycle',
        name: 'SoulCycle',
        bookingUrl: data.bookingUrl,
      },
      capacity: parseInt(data.spotsTotal) || 0,
      enrolled: parseInt(data.spotsTotal) - parseInt(data.spotsAvailable) || 0,
      price: 0, // SoulCycle uses credits
      currency: 'USD',
    };
  }
}
```

### Register Provider

Add to `src/index.ts`:
```typescript
import { SoulCycleProvider } from './providers/SoulCycleProvider';

// In provider map
const providers = {
  // ... existing providers
  soulcycle: new SoulCycleProvider(),
};
```

Add to `config/providers.json`:
```json
{
  "soulcycle": {
    "enabled": true,
    "name": "SoulCycle",
    "locations": [
      "newyork/tribeca",
      "newyork/upperwestside",
      "losangeles/brentwood",
      "sanfrancisco/castro"
    ]
  }
}
```

## Step 7: Handle Common Challenges

### Challenge: Dynamic Loading
Classes load via JavaScript after page load.

**Solution:**
```typescript
// Wait for network to be idle
await page.goto(url, { waitUntil: 'networkidle2' });

// Or wait for specific element
await page.waitForSelector('.class-card', { timeout: 30000 });

// Or wait for API response
await page.waitForResponse(
  response => response.url().includes('/api/classes'),
  { timeout: 30000 }
);
```

### Challenge: Date Selection
Need to navigate through different dates.

**Solution:**
```typescript
// Click date picker
await page.click('.date-picker');

// Select specific date
await page.click(`[data-date="${targetDate}"]`);

// Wait for classes to reload
await page.waitForTimeout(2000);
```

### Challenge: Multiple Locations
SoulCycle has 90+ studios.

**Solution:**
```typescript
const locations = [
  'newyork/tribeca',
  'newyork/upperwestside',
  'losangeles/brentwood',
  // ... more locations
];

for (const location of locations) {
  const url = `https://www.soul-cycle.com/studios/${location}/`;
  // Scrape each location
}
```

### Challenge: Rate Limiting
SoulCycle may block rapid requests.

**Solution:**
```typescript
// Add delays between requests
await page.waitForTimeout(randomDelay(2000, 5000));

// Use stealth plugin (already in project)
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());

// Rotate user agents
const userAgent = randomUserAgent();
await page.setUserAgent(userAgent);
```

## Step 8: Testing

### Test Single Location
```bash
# Build the project first
npm run build

# Test scraper
npm run scrape -- scrape -p soulcycle -m 10 --no-upload

# Check logs
tail -f logs/combined.log
tail -f logs/error.log
```

### Test Multiple Locations
```bash
# Scrape specific location
npm run scrape -- scrape -p soulcycle -l "newyork/tribeca" -m 50 --no-upload

# Scrape date range
npm run scrape -- scrape -p soulcycle --start-date 2025-11-24 --end-date 2025-11-30 --no-upload
```

### Verify Database
```bash
sqlite3 numina-scrapers.db "SELECT COUNT(*) FROM classes WHERE provider = 'soulcycle';"

sqlite3 numina-scrapers.db "SELECT name, start_time, instructor, location FROM classes WHERE provider = 'soulcycle' LIMIT 5;"
```

## Step 9: Alternative - Direct API Integration

If you discover SoulCycle has a public API:

```javascript
// Save as: soulcycle-api.js
const BASE_URL = 'https://api.soul-cycle.com'; // Example

async function fetchClasses(location, date) {
  const response = await fetch(
    `${BASE_URL}/classes?location=${location}&date=${date}`
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.classes || data.payload || data;
}

// Use this instead of Puppeteer scraping
```

## Expected Results

**Per Studio:** 30-80 classes per week
**NYC (10 studios):** 300-800 classes
**National (90 studios):** 2500-7000 classes

## Data Quality Checks

Before considering it working:
- [ ] Can extract at least 20 classes
- [ ] All required fields populated
- [ ] Instructor names present
- [ ] Times in correct ISO 8601 format
- [ ] Booking URLs functional
- [ ] Multiple studios supported
- [ ] Can run without errors

## Common Issues & Solutions

### Issue: "Class container not found"
**Solution:** Update selector - SoulCycle changed their HTML structure

### Issue: Only showing limited classes
**Solution:** May need to scroll or paginate to load more

### Issue: Booking URLs require login
**Solution:** Note this in data - users need SoulCycle account to book

### Issue: Classes show as "SOLD OUT"
**Solution:** Still scrape them - users want to see popular classes

## Success Criteria

✅ Scraper runs without errors
✅ Extracts 50+ classes from NYC locations
✅ All required fields populated
✅ Multiple instructors present
✅ Booking URLs work (even if login required)
✅ Data stored in database
✅ Can extend to multiple cities

## Delivery

Once working, document:
1. Authentication method (if needed)
2. Selectors/API endpoints used
3. Any limitations discovered
4. Rate limits encountered
5. Recommended scraping frequency
6. Sample output (5 classes)

**Example Success Output:**
```
✅ SoulCycle Scraper Working!
   Locations scraped: 5 NYC studios
   Classes found: 187
   Date range: Nov 24-30, 2025
   Instructors: 23 unique
   Database: Updated successfully
   Backend: Ready to serve data
```

---

**Priority:** HIGH - SoulCycle is a major brand with consistent data format across all locations.
