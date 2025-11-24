# ClassPass Scraper Instructions for Claude Agent

## Mission
Fix and test the existing ClassPass scraper to aggregate fitness classes from multiple studios through the ClassPass platform.

## Why ClassPass is Valuable
ClassPass aggregates thousands of studios and gyms into one platform. Successfully scraping ClassPass gives you access to:
- 100+ class types (yoga, cycling, HIIT, boxing, pilates, etc.)
- Thousands of studios across major cities
- Real-time availability and pricing
- Consolidated booking system

## Current Status
- Provider exists: `src/providers/ClassPassProvider.ts`
- Status: **UNTESTED** - May work or may be broken
- Last known working: Unknown

## Project Location
```bash
cd ~/IdeaProjects/numina-scrapers
```

## Step 1: Understand Current Implementation

Read the existing provider:
```bash
cat src/providers/ClassPassProvider.ts
```

Key things to check:
- What URL is it targeting?
- What selectors is it using?
- Does it require authentication?
- How does it handle pagination?

## Step 2: Inspect ClassPass Website

### Test Account Required?
ClassPass typically requires login to see class schedules. Determine:
- Can you see classes without login?
- If login required, do we have test credentials?
- Can we use a free trial account?

### Inspect the Site Structure
```javascript
// Create inspection script: inspect-classpass.js
import puppeteer from 'puppeteer';

const url = 'https://classpass.com/search?lat=40.7580&lon=-73.9855'; // NYC

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true
  });
  const page = await browser.newPage();

  // Check if login required
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForTimeout(5000);

  // Take screenshot
  await page.screenshot({ path: 'classpass-home.png', fullPage: true });

  // Check for classes
  const structure = await page.evaluate(() => {
    // Look for class listings
    const selectors = [
      '.class',
      '.class-card',
      '.search-result',
      '[data-testid*="class"]',
      '[class*="ClassCard"]',
      '.venue-card'
    ];

    const found = {};
    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        found[selector] = {
          count: elements.length,
          sample: elements[0]?.textContent?.substring(0, 200)
        };
      }
    });

    return {
      title: document.title,
      url: window.location.href,
      requiresLogin: !!document.querySelector('[data-testid*="login"]'),
      found
    };
  });

  console.log(JSON.stringify(structure, null, 2));

  // Keep open for manual inspection
  await page.waitForTimeout(60000);
  await browser.close();
})();
```

Run it:
```bash
node inspect-classpass.js > classpass-structure.json
```

## Step 3: Check for API Calls

ClassPass likely uses a GraphQL or REST API. Monitor network traffic:

```javascript
// Add to inspection script
page.on('response', async response => {
  const url = response.url();
  if (url.includes('api') || url.includes('graphql') || url.includes('class')) {
    console.log('API Call:', url);
    try {
      const data = await response.json();
      console.log('Response:', JSON.stringify(data, null, 2).substring(0, 500));
    } catch (e) {
      // Not JSON
    }
  }
});
```

**Look for endpoints like:**
- `https://classpass.com/api/v2/classes`
- `https://api.classpass.com/graphql`
- `https://classpass.com/venues/{id}/classes`

## Step 4: Authentication Strategy

If login is required:

### Option A: Use Session Cookies
```typescript
async setupAuth(page: Page): Promise<void> {
  // Load saved cookies
  const cookies = JSON.parse(fs.readFileSync('classpass-cookies.json', 'utf-8'));
  await page.setCookie(...cookies);
}
```

### Option B: Automated Login
```typescript
async login(page: Page): Promise<void> {
  await page.goto('https://classpass.com/login');
  await page.type('[name="email"]', process.env.CLASSPASS_EMAIL);
  await page.type('[name="password"]', process.env.CLASSPASS_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForNavigation();

  // Save cookies for reuse
  const cookies = await page.cookies();
  fs.writeFileSync('classpass-cookies.json', JSON.stringify(cookies));
}
```

### Option C: API Token (If Available)
Some services expose API tokens in localStorage or cookies. Check:
```javascript
const tokens = await page.evaluate(() => {
  return {
    localStorage: { ...localStorage },
    cookies: document.cookie
  };
});
```

## Step 5: Data Extraction Pattern

ClassPass classes should map to this structure:

```typescript
interface ClassPassClass {
  name: string;                    // "Vinyasa Flow"
  studio: string;                  // "Pure Yoga NYC"
  location: string;                // "Upper West Side"
  instructor: string;              // "Sarah Johnson"
  startTime: string;               // ISO 8601
  duration: number;                // minutes
  credits: number;                 // ClassPass credits
  spotsAvailable: number;
  classType: string;               // "yoga", "cycling", etc.
  bookingUrl: string;
}
```

## Step 6: Update the Provider

Based on your findings, update `src/providers/ClassPassProvider.ts`:

```typescript
export class ClassPassProvider extends BaseProvider {
  async scrapeClasses(options: ScrapeOptions): Promise<FitnessClass[]> {
    const classes: FitnessClass[] = [];
    const page = await this.browser!.newPage();

    try {
      // 1. Authenticate if needed
      if (requiresAuth) {
        await this.authenticate(page);
      }

      // 2. Navigate to search/schedule
      const searchUrl = this.buildSearchUrl(options);
      await page.goto(searchUrl, { waitUntil: 'networkidle0' });

      // 3. Wait for classes to load
      await page.waitForSelector('CORRECT_SELECTOR', { timeout: 30000 });

      // 4. Extract class data
      const classData = await page.evaluate(() => {
        // Your extraction logic here
      });

      // 5. Transform to standard format
      for (const data of classData) {
        classes.push(this.transformToFitnessClass(data));
      }

    } catch (error) {
      this.logger.error(`ClassPass scraping error: ${error}`);
    } finally {
      await page.close();
    }

    return classes;
  }

  private buildSearchUrl(options: ScrapeOptions): string {
    // NYC by default
    const lat = options.latitude || 40.7580;
    const lon = options.longitude || -73.9855;
    return `https://classpass.com/search?lat=${lat}&lon=${lon}`;
  }
}
```

## Step 7: Testing

```bash
# Test with small result set
npm run scrape -- scrape -p classpass -m 10 --no-upload

# Check results
sqlite3 numina-scrapers.db "SELECT name, provider, location FROM classes WHERE source = 'classpass' LIMIT 5;"

# Test with location filter
npm run scrape -- scrape -p classpass -l "new-york" -m 50 --no-upload
```

## Common Issues & Solutions

### Issue: Login Modal Blocks Scraping
**Solution:** Handle modal dismissal
```typescript
await page.evaluate(() => {
  document.querySelector('.modal-close')?.click();
});
```

### Issue: Infinite Scroll
**Solution:** Implement scroll pagination
```typescript
async scrollToLoadMore(page: Page, maxScrolls: number = 10): Promise<void> {
  for (let i = 0; i < maxScrolls; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    // Check if more content loaded
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === lastHeight) break;
    lastHeight = newHeight;
  }
}
```

### Issue: Rate Limiting
**Solution:** Add delays and respect rate limits
```typescript
await page.waitForTimeout(randomDelay(2000, 5000));
```

### Issue: Dynamic Pricing (Credits vary by time/demand)
**Solution:** Store actual credit cost, not estimated
```typescript
credits: parseInt(el.querySelector('[data-credits]')?.textContent || '0')
```

## Alternative: Use ClassPass Partner API (If Available)

Some partners have official API access. Check:
- ClassPass Business API
- ClassPass Partner Portal
- Official integrations

## Data Quality Checks

Before considering it working:
- [ ] Can extract at least 20 classes
- [ ] All required fields populated
- [ ] Dates in correct format
- [ ] Booking URLs work
- [ ] Multiple class types present
- [ ] Multiple studios present
- [ ] Location data accurate

## ClassPass-Specific Considerations

1. **Credits vs. Price** - ClassPass uses credits, not dollars. Consider:
   - Storing credit cost
   - Converting to approximate USD (varies by market)
   - Note that credits ≠ fixed price

2. **Studio Attribution** - Each class belongs to a partner studio
   - Extract studio name
   - Extract studio location
   - Link to studio profile if possible

3. **Class Categories** - ClassPass has specific categories:
   - Strength
   - Cycling
   - Yoga
   - Barre
   - Pilates
   - Dance
   - Boxing
   - Running
   - Map these to our standard `classType`

4. **Time Slots** - ClassPass shows real-time availability
   - Capture spots available
   - Note if waitlist only
   - Track booking deadline (usually 12 hours before)

## Success Criteria

✅ Successfully authenticate (if needed)
✅ Extract 50+ classes from NYC area
✅ All required fields populated
✅ Classes from multiple studios
✅ Various class types represented
✅ Booking URLs functional
✅ Can run without errors
✅ Data stored in database

## Delivery

Once working, document:
1. Authentication method used
2. Selectors that work
3. Any API endpoints discovered
4. Rate limits encountered
5. Recommended scraping frequency
6. Sample output (5 classes)

---

**Priority:** HIGH - ClassPass aggregates many studios, giving us the most coverage for effort.
