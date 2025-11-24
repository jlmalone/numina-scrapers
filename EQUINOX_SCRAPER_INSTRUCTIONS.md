# Equinox Scraper Setup Instructions for Claude Agent

## Current Status

The numina-scrapers project at `~/IdeaProjects/numina-scrapers` already has an Equinox scraper, but it's failing with:
```
[equinox] Schedule container not found. Site structure may have changed.
```

Your task is to fix the Equinox scraper to work with the current Equinox website.

## Target URLs

**Primary Target:** https://www.equinox.com/clubs/canada/vancouver/westgeorgiast
**Format:** https://www.equinox.com/clubs/{country}/{city}/{location-slug}

## Project Overview

- **Location:** `~/IdeaProjects/numina-scrapers`
- **Language:** TypeScript + Node.js (Node 20+)
- **Browser Automation:** Puppeteer with stealth plugin
- **Database:** SQLite (numina-scrapers.db)
- **Architecture:** Modular provider pattern

## Step 1: Understand the Current Implementation

### Read These Files First
```bash
cd ~/IdeaProjects/numina-scrapers

# Main scraper implementation
cat src/providers/EquinoxProvider.ts

# Base class to understand the interface
cat src/providers/BaseProvider.ts

# Command-line interface
cat src/index.ts
```

### Key Files
- `src/providers/EquinoxProvider.ts` - Current broken implementation
- `src/providers/BaseProvider.ts` - Abstract class all providers extend
- `src/core/database.ts` - SQLite operations
- `config/providers.json` - Configuration

## Step 2: Inspect the Target Website

Create a quick inspection script to understand the current page structure:

```javascript
// save as: inspect-equinox.js
import puppeteer from 'puppeteer';

const url = 'https://www.equinox.com/clubs/canada/vancouver/westgeorgiast';

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: 'networkidle0' });

  // Wait for any dynamic content
  await page.waitForTimeout(5000);

  // Take a screenshot
  await page.screenshot({ path: 'equinox-page.png', fullPage: true });

  // Get page structure
  const structure = await page.evaluate(() => {
    // Look for schedule/class elements
    const scheduleSelectors = [
      '.schedule',
      '.classes',
      '.class-schedule',
      '[class*="schedule"]',
      '[class*="class"]',
      '[data-testid*="schedule"]',
      '[data-testid*="class"]'
    ];

    const found = {};
    scheduleSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        found[selector] = {
          count: elements.length,
          samples: Array.from(elements).slice(0, 2).map(el => ({
            className: el.className,
            id: el.id,
            textContent: el.textContent?.substring(0, 100)
          }))
        };
      }
    });

    return {
      title: document.title,
      found,
      allClasses: Array.from(document.body.querySelectorAll('[class]'))
        .map(el => el.className)
        .filter((c, i, arr) => arr.indexOf(c) === i && c.includes('class'))
        .slice(0, 50)
    };
  });

  console.log(JSON.stringify(structure, null, 2));

  // Keep browser open for manual inspection
  console.log('Browser will stay open for 60 seconds for manual inspection...');
  await page.waitForTimeout(60000);

  await browser.close();
})();
```

Run it:
```bash
cd ~/IdeaProjects/numina-scrapers
node inspect-equinox.js > equinox-structure.json
```

## Step 3: Understand the Data Model

The scraper must return an array of `FitnessClass` objects with this structure:

```typescript
interface FitnessClass {
  // Required fields
  name: string;                  // Class name (e.g., "Yoga Flow")
  description: string;           // Class description
  classType: string;             // Type (yoga, cycling, strength, etc.)
  startTime: string;             // ISO 8601 format
  endTime: string;               // ISO 8601 format
  duration: number;              // Minutes

  // Location
  location: {
    name: string;                // Studio name
    address: string;             // Full address
    latitude?: number;           // Optional
    longitude?: number;          // Optional
  };

  // Trainer
  trainer: {
    id?: string;
    name: string;
    bio?: string;
    photoUrl?: string;
  };

  // Provider
  provider: {
    id: string;                  // "equinox"
    name: string;                // "Equinox"
    logoUrl?: string;
    bookingUrl: string;          // URL to book the class
  };

  // Capacity & Pricing
  capacity: number;              // Max participants
  enrolled: number;              // Current participants
  price: number;                 // Class price
  currency: string;              // "USD", "CAD", etc.

  // Optional enhanced data
  imageUrl?: string;
  intensity?: 'low' | 'medium' | 'high';
  tags?: string[];
  amenities?: string[];
  isCancelled?: boolean;
}
```

## Step 4: Fix the EquinoxProvider

### Current Failure Pattern
The error "Schedule container not found" means the CSS selector is wrong.

### Your Task
1. Use the inspection script output to find the correct selectors
2. Update `src/providers/EquinoxProvider.ts` with new selectors
3. Handle these scenarios:
   - Multi-location support (different clubs)
   - Date/time parsing (handle timezones)
   - Pagination if needed
   - Loading spinners / dynamic content
   - Error handling for missing data

### Implementation Pattern

```typescript
export class EquinoxProvider extends BaseProvider {
  async scrapeClasses(options: ScrapeOptions): Promise<FitnessClass[]> {
    const classes: FitnessClass[] = [];
    const page = await this.browser!.newPage();

    try {
      // 1. Navigate to schedule page
      await page.goto(url, { waitUntil: 'networkidle0' });

      // 2. Wait for schedule to load
      await page.waitForSelector('YOUR_CORRECT_SELECTOR', { timeout: 30000 });

      // 3. Extract class data
      const classData = await page.evaluate(() => {
        // Extract data from DOM
        // Return array of raw class data
      });

      // 4. Transform to FitnessClass format
      for (const data of classData) {
        classes.push(this.transformToFitnessClass(data));
      }

    } catch (error) {
      this.logger.error(`Scraping error: ${error}`);
    } finally {
      await page.close();
    }

    return classes;
  }
}
```

## Step 5: Testing

### Test Single Location
```bash
cd ~/IdeaProjects/numina-scrapers

# Run the scraper in dev mode (no database upload)
npm run scrape -- scrape -p equinox -m 10 --no-upload

# Check logs
tail -f logs/combined.log
tail -f logs/error.log
```

### Test with Different Options
```bash
# Scrape specific location
npm run scrape -- scrape -p equinox -l "vancouver" -m 50 --no-upload

# Scrape date range
npm run scrape -- scrape -p equinox --start-date 2025-11-24 --end-date 2025-11-30 --no-upload
```

### Verify Database
```bash
# Check what was scraped
sqlite3 numina-scrapers.db "SELECT COUNT(*) FROM classes WHERE provider = 'equinox';"
sqlite3 numina-scrapers.db "SELECT name, start_time, location FROM classes WHERE provider = 'equinox' LIMIT 5;"
```

## Step 6: Set Up Regular Scraping

Once the scraper works, set up automated scraping:

### Option A: Cron Schedule (Built-in)
```bash
# Start the scheduler (runs daily at 2am by default)
npm run scrape -- schedule

# Or customize the schedule in src/index.ts
```

### Option B: System Cron
```bash
# Add to crontab
crontab -e

# Run every 6 hours
0 */6 * * * cd ~/IdeaProjects/numina-scrapers && npm run scrape -- scrape -p equinox >> ~/logs/equinox-scraper.log 2>&1
```

### Option C: macOS launchd
Create `~/Library/LaunchAgents/com.numina.equinox-scraper.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.numina.equinox-scraper</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/josephmalone/IdeaProjects/numina-scrapers/dist/index.js</string>
        <string>scrape</string>
        <string>-p</string>
        <string>equinox</string>
    </array>
    <key>StartInterval</key>
    <integer>21600</integer> <!-- 6 hours -->
    <key>StandardOutPath</key>
    <string>/Users/josephmalone/logs/equinox-scraper.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/josephmalone/logs/equinox-scraper-error.log</string>
</dict>
</plist>
```

Load it:
```bash
launchctl load ~/Library/LaunchAgents/com.numina.equinox-scraper.plist
launchctl start com.numina.equinox-scraper
```

## Step 7: Add Multiple Locations

After fixing the Vancouver location, extend to other locations:

### Configuration Approach
Update `config/providers.json`:

```json
{
  "providers": {
    "equinox": {
      "enabled": true,
      "locations": [
        {
          "slug": "canada/vancouver/westgeorgiast",
          "name": "West Georgia St",
          "city": "Vancouver",
          "country": "Canada"
        },
        {
          "slug": "new-york/manhattan/east74th",
          "name": "East 74th Street",
          "city": "New York",
          "country": "USA"
        }
      ]
    }
  }
}
```

### Code Approach
Modify EquinoxProvider to loop through all configured locations.

## Debugging Tips

### Enable Puppeteer DevTools
```typescript
const browser = await puppeteer.launch({
  headless: false,
  devtools: true,
  slowMo: 100
});
```

### Save Page HTML for Analysis
```typescript
const html = await page.content();
fs.writeFileSync('equinox-page.html', html);
```

### Screenshot on Error
```typescript
catch (error) {
  await page.screenshot({ path: 'error.png' });
  throw error;
}
```

### Log Network Requests
```typescript
page.on('response', response => {
  if (response.url().includes('schedule') || response.url().includes('class')) {
    console.log('API Call:', response.url());
  }
});
```

## Common Issues & Solutions

### Issue: Schedule loads via JavaScript/API
**Solution:** Check network tab for API calls, intercept and use API directly instead of scraping HTML

### Issue: Need to select a date
**Solution:** Find date picker selector and programmatically select dates

### Issue: Infinite scroll or pagination
**Solution:** Implement scroll/pagination logic

### Issue: Authentication required
**Solution:** Add login flow to provider (see MindbodyProvider for example)

### Issue: Rate limiting / bot detection
**Solution:** Use stealth plugin (already configured), add delays, rotate user agents

## Success Criteria

✅ Scraper runs without errors
✅ Extracts at least 10 classes from Vancouver location
✅ All required fields are populated
✅ Dates are in correct ISO 8601 format
✅ Can run automatically on schedule
✅ Data is stored in SQLite database
✅ Can extend to multiple locations

## Next Steps After Success

1. Add more Equinox locations
2. Test across different timezones
3. Set up monitoring/alerting for scraper failures
4. Integrate with Numina backend API (currently using `--no-upload`)
5. Add data validation tests
6. Document the selectors and data structure

## Questions to Ask User After Investigation

- Do you need login credentials for Equinox?
- Should we scrape just upcoming classes or historical data?
- What's the acceptable frequency for scraping?
- Should we handle membership-only classes differently?
- Any specific class types to prioritize/filter?

---

**Remember:** The goal is to have a reliable, automated system that regularly fetches Equinox class schedules and makes them available to the Numina web app through the backend API.
