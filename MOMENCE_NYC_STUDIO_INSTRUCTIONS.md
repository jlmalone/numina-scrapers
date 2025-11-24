# Momence NYC Studio Integration Instructions for Claude Agent

## Mission
Find and integrate NYC fitness studios that use Momence booking platform into our existing working Momence API scraper.

## Why This is Easy
✅ **The API already works!** We successfully fetch 39 classes from Alchemy Yoga (Bali)
✅ **No scraping needed** - Direct API access, no authentication required
✅ **Just need Host IDs** - Only missing piece is finding NYC studios using Momence

## Current Status

**Working Implementation:** `~/IdeaProjects/numina-scrapers/momence-api.js`
- ✅ Fetches classes from public readonly API
- ✅ Transforms to Numina format
- ✅ Stores in SQLite database
- ✅ Backend serving data on port 8080

**Current Data:**
- 1 studio: Alchemy Yoga & Meditation Center (Bali)
- Host ID: 23168
- 39 classes fetched

**What We Need:** NYC/SF/LA studio Host IDs

## Step 1: Find Momence Studios in NYC

### Method A: Google Search Discovery

Search for studios that use Momence:
```
site:momence.com yoga nyc
site:momence.com pilates nyc
site:momence.com fitness nyc
site:momence.com cycling nyc
site:momence.com barre nyc
```

**Look for URLs like:**
- `https://momence.com/sky-ting-yoga`
- `https://momence.com/strala-yoga`
- `https://momence.com/yoga-collective`

### Method B: Direct Studio Research

Known studio chains that may use Momence:
- Sky Ting Yoga
- Strala Yoga
- The Yoga Collective
- Modo Yoga NYC
- Pure Yoga NYC
- Housing Works Bookstore (yoga classes)
- Laughing Lotus
- Kula Yoga Project

**Check each studio's website for:**
- "Book with Momence" button
- URLs containing `momence.com`
- Booking pages hosted on Momence subdomain

### Method C: Inspect Momence Homepage

1. Visit https://momence.com
2. Look for studio directory or search feature
3. Filter by location: New York, NY
4. Browse available studios

### Method D: Web Inspector Discovery

Create a script to find Host IDs from Momence pages:

```javascript
// Save as: find-host-ids.js
import puppeteer from 'puppeteer';

const studioUrls = [
  'https://momence.com/sky-ting-yoga',
  'https://momence.com/strala-yoga',
  'https://momence.com/yoga-collective'
];

(async () => {
  const browser = await puppeteer.launch({ headless: false });

  for (const url of studioUrls) {
    const page = await browser.newPage();

    console.log(`\n🔍 Checking: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle0' });

      // Monitor API calls for host ID
      page.on('response', async response => {
        const url = response.url();
        if (url.includes('readonly-api.momence.com')) {
          console.log('   📡 API Call:', url);

          // Extract host ID from URL
          const match = url.match(/\/host\/(\d+)\//);
          if (match) {
            console.log('   ✅ Found Host ID:', match[1]);
          }
        }
      });

      await page.waitForTimeout(5000);

      // Try to extract from page metadata
      const hostId = await page.evaluate(() => {
        // Check for data attributes
        const hostElement = document.querySelector('[data-host-id]');
        if (hostElement) return hostElement.dataset.hostId;

        // Check script tags for config
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          const match = script.textContent?.match(/hostId['":\s]+(\d+)/);
          if (match) return match[1];
        }

        return null;
      });

      if (hostId) {
        console.log('   ✅ Host ID from DOM:', hostId);
      }

    } catch (error) {
      console.log('   ❌ Error:', error.message);
    }

    await page.close();
  }

  await browser.close();
})();
```

Run it:
```bash
cd ~/IdeaProjects/numina-scrapers
node find-host-ids.js
```

## Step 2: Verify Host IDs Work

Once you find potential Host IDs, test them:

```bash
# Test API endpoint directly
HOSTID=12345  # Replace with found ID

curl -s "https://readonly-api.momence.com/host-plugins/host/${HOSTID}/host-schedule/sessions?sessionTypes[]=course-class&sessionTypes[]=fitness&fromDate=$(date -u +%Y-%m-%d)T00:00:00.000Z&pageSize=10&page=0" | python3 -m json.tool
```

**Good Response:**
```json
{
  "payload": [
    {
      "id": 123456789,
      "sessionName": "Vinyasa Flow",
      "teacher": "Sarah Smith",
      "startsAt": "2025-11-24T18:00:00Z",
      ...
    }
  ],
  "pagination": {
    "totalCount": 45
  }
}
```

**Bad Response (wrong Host ID):**
```json
{
  "error": "Host not found"
}
```

## Step 3: Add Studios to momence-api.js

Edit `~/IdeaProjects/numina-scrapers/momence-api.js`:

```javascript
// Find the STUDIOS array (currently around line 15)
const STUDIOS = [
  {
    hostId: '23168',
    name: 'Alchemy Yoga & Meditation Center',
    location: 'Ubud, Bali, Indonesia',
    type: 'yoga'
  },
  // ADD YOUR NYC STUDIOS HERE:
  {
    hostId: 'FOUND_HOST_ID_1',
    name: 'Sky Ting Yoga',
    location: 'New York, NY',
    type: 'yoga'
  },
  {
    hostId: 'FOUND_HOST_ID_2',
    name: 'Strala Yoga',
    location: 'New York, NY',
    type: 'yoga'
  }
  // Add as many as you find!
];
```

## Step 4: Run the Scraper

```bash
cd ~/IdeaProjects/numina-scrapers

# Fetch fresh data
node momence-api.js
```

**Expected Output:**
```
🎯 Fetching REAL data from Momence API...

📍 Alchemy Yoga & Meditation Center
   Host ID: 23168
   Location: Ubud, Bali, Indonesia

   Fetching page 1...
   Found 39 classes (page 1/1)
   ✅ Found 39 classes

📍 Sky Ting Yoga
   Host ID: 12345
   Location: New York, NY

   Fetching page 1...
   Found 87 classes (page 1/2)
   Fetching page 2...
   Found 13 classes (page 2/2)
   ✅ Found 100 classes

=== SUMMARY ===
Total studios checked: 2
Total classes fetched: 139

💾 Storing 139 classes in database...
✅ Stored successfully!
```

## Step 5: Verify in Database

```bash
sqlite3 ~/IdeaProjects/numina-scrapers/numina-scrapers.db

# Check new data
SELECT provider, COUNT(*) as class_count, location
FROM momence_classes
GROUP BY provider
ORDER BY class_count DESC;

# Sample new classes
SELECT name, instructor, start_time, location, booking_url
FROM momence_classes
WHERE provider = 'Sky Ting Yoga'
LIMIT 5;

.quit
```

## Step 6: Restart Backend

```bash
# Stop current backend (if running)
lsof -ti:8080 | xargs kill

# Start with new data
cd ~/IdeaProjects/numina-backend
node real-data-server.js
```

## Step 7: Test in Web App

1. Open browser: `http://localhost:3011`
2. Click "Enable Debug Mode"
3. Browse classes
4. Should see classes from multiple NYC studios
5. Click booking links to verify they work

## Known NYC Studios Using Momence (Research These)

**Confirmed Momence Users:**
- Many independent yoga studios
- Meditation centers
- Wellness spaces
- Small fitness studios

**How to Verify:**
1. Google: "[Studio Name] momence"
2. Visit studio website
3. Look for "Book Now" or "Schedule"
4. Check if URL redirects to momence.com
5. If yes, extract Host ID

## Alternative: Crowdsourced Discovery

If manual searching is slow, create a web scraper to:
1. Get list of NYC yoga/fitness studios from Yelp/Google Maps
2. Check each studio's website for momence.com links
3. Auto-extract Host IDs

## Data Quality Expectations

**Per Studio:** 30-150 classes (7-day window)
**Coverage:** 10 NYC studios = 500-1000 classes
**Refresh Rate:** Run daily to keep schedule current

## Success Criteria

✅ Find at least 5 NYC studios using Momence
✅ Extract Host IDs for each
✅ Add to STUDIOS array in momence-api.js
✅ Successfully fetch classes from all studios
✅ Store in database
✅ Verify booking URLs work
✅ Backend serves new data
✅ Web app displays NYC classes

## Troubleshooting

### Issue: Studio website found but no Host ID
**Solution:** Open browser DevTools, go to Network tab, refresh page, look for API calls to readonly-api.momence.com

### Issue: Host ID returns 0 classes
**Possible Causes:**
- Studio has no upcoming classes scheduled
- Wrong Host ID
- Studio inactive on Momence

**Action:** Verify by visiting `https://momence.com/[studio-slug]` directly

### Issue: API returns error
**Solution:** Check API response for error message, verify Host ID format (should be numeric string)

## Time Estimate

- Finding 5 studios: 30-60 minutes
- Adding to code: 5 minutes
- Testing: 10 minutes
- **Total: 45-75 minutes**

## Delivery

Once complete, document:
1. List of studios added (name, Host ID, location)
2. Total class count per studio
3. Sample classes from each studio
4. Any issues encountered
5. Recommended update frequency

**Example:**
```
✅ Added 5 NYC Momence Studios:
   1. Sky Ting Yoga (Host: 12345) - 87 classes
   2. Strala Yoga (Host: 67890) - 45 classes
   3. Modo Yoga NYC (Host: 11223) - 62 classes
   4. Laughing Lotus (Host: 44556) - 38 classes
   5. Kula Yoga Project (Host: 77889) - 41 classes

Total: 273 NYC classes added
Database: 312 classes (39 Bali + 273 NYC)
Backend: Restarted on port 8080
Web app: Verified working
```

---

**Priority:** HIGH - This is the fastest way to scale our data coverage. API is already working, just need more Host IDs!
