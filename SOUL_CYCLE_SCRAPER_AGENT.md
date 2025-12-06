# SoulCycle Scraper - Agent Handover Document

**Session Date:** November 25, 2025
**Status:** 🟡 In Progress - Discovery Phase
**Next Agent:** Continue from "Fix Provider Implementation" phase

---

## 🎯 Mission Objective

Create or fix the SoulCycle scraper to fetch cycling class schedules from SoulCycle studios across major cities for the Numina fitness class aggregation platform.

## 📊 Current Status Summary

### ✅ Completed
1. **Provider File Exists** - Found existing `SoulCycleProvider.ts` in `src/providers/`
2. **Provider Registered** - Already configured in `config/providers.json` and `src/index.ts`
3. **Website Discovery** - Identified correct domain: `soul-cycle.com` (with hyphen)
4. **Booking System Research** - Confirmed SoulCycle uses **proprietary booking system** (not Mindbody/Mariana Tek)
5. **Created Investigation Scripts** - Multiple inspection scripts ready for testing

### 🟡 In Progress
- **API Endpoint Discovery** - Need to identify actual schedule/class API endpoints
- **Provider Implementation** - Current provider uses generic template selectors that won't work

### ❌ Not Started
- Provider implementation fix
- Testing with actual data
- Database verification

---

## 🔍 Key Discoveries

### 1. Website Structure
- **Correct Domain:** `https://www.soul-cycle.com` (hyphen, not soulcycle.com)
- **Working URLs:**
  - Studio listings: `https://www.soul-cycle.com/studios/nyc/`
  - Individual studios: `https://www.soul-cycle.com/studios/ny-newyork-nomad/`
  - Class finder: `https://www.soul-cycle.com/find-a-class/studio/20/`
- **Old URLs:** `soulcycle.com/find-a-class` returns 404

### 2. Booking System
**Source:** [Well+Good Article on SoulCycle's new booking system](https://www.wellandgood.com/soulcycle-has-a-new-booking-system-and-website/)

- SoulCycle uses a **custom-built proprietary booking system** (2020 redesign)
- NOT using third-party platforms like:
  - ❌ Mindbody
  - ❌ Mariana Tek
  - ❌ Xplor
- This means we must reverse-engineer their actual API

### 3. Current Provider Implementation
**File:** `src/providers/SoulCycleProvider.ts`

**Status:** Template only - uses generic selectors that likely won't work:
```typescript
// Current selectors (probably incorrect):
'.class-card, .ride-card, .schedule-item, .class-item'
'.instructor-name, .instructor, .teacher'
'.class-time, .time, .start-time'
```

**Configuration:**
```json
{
  "soulcycle": {
    "enabled": true,
    "baseUrl": "https://www.soulcycle.com",
    "defaultLocation": "new-york",
    "rateLimit": 15
  }
}
```

---

## 🛠️ Investigation Scripts Created

### 1. `inspect-soulcycle.mjs` (Original)
- Full website structure inspection
- API call monitoring
- Screenshot capture
- **Status:** ⚠️ Failed on old URLs

### 2. `simple-soulcycle-check.mjs`
- Quick URL validation
- **Result:** Confirmed old URLs return 404
- **Finding:** Need to use `soul-cycle.com` with hyphen

### 3. `inspect-soulcycle-v2.mjs`
- Updated with correct URLs
- Enhanced API monitoring
- Saves API responses to JSON files
- **Status:** 🏃 Was running at session end

### 4. `find-soulcycle-api.mjs` ⭐ **USE THIS NEXT**
- Most focused script for API discovery
- Monitors all SoulCycle-specific API calls
- Auto-saves responses
- Attempts to click schedule/book buttons
- **Next Action:** Run this script to find actual API endpoints

---

## 📋 Next Steps for Your Session

### Immediate Actions (30-60 minutes)

#### Step 1: Run API Discovery Script
```bash
cd /Users/josephmalone/IdeaProjects/numina-scrapers
node find-soulcycle-api.mjs
```

**Expected Outcomes:**
- ✅ Best case: Discover JSON API endpoints for class schedules
- ⚠️ Medium case: Find server-rendered HTML with class data
- ❌ Worst case: Requires authentication/login to see schedules

#### Step 2: Analyze Results

**If API endpoints found:**
- Check `soulcycle-api-*.json` files created
- Identify structure of class data
- Note authentication requirements
- Document API patterns

**If no API endpoints:**
- SoulCycle may use server-side rendering
- Need to extract class data from HTML DOM
- Use puppeteer to scrape rendered HTML
- Focus on selectors for class cards

#### Step 3: Update Provider Implementation

**File to edit:** `src/providers/SoulCycleProvider.ts`

**Update these methods:**
1. `buildScheduleUrl()` - Use correct studio URL format
2. `extractClasses()` - Use actual selectors/API endpoints found
3. `transformToFitnessClass()` - Map SoulCycle data to standard format

### Medium-Term Actions (1-2 hours)

#### Step 4: Test the Scraper
```bash
cd /Users/josephmalone/IdeaProjects/numina-scrapers
npm run build
npm run scrape -- scrape -p soulcycle -m 10 --no-upload
```

**Check logs:**
```bash
tail -f logs/combined.log
tail -f logs/error.log
```

#### Step 5: Verify Data
```bash
sqlite3 numina-scrapers.db "SELECT COUNT(*) FROM classes WHERE provider = 'soulcycle';"

sqlite3 numina-scrapers.db "SELECT name, start_time, instructor, location FROM classes WHERE provider = 'soulcycle' LIMIT 5;"
```

---

## 🎓 Technical Context

### Expected Data Model
Each SoulCycle class should map to:

```typescript
interface SoulCycleClass {
  // Required fields
  name: string;                    // "SoulCycle" or class name
  instructor: string;              // Instructor name
  datetime: Date;                  // ISO 8601 format
  location: {
    name: string;                  // "SoulCycle Tribeca"
    address: string;
    lat: number;
    long: number;
  };

  // Optional but valuable
  duration: number;                // Usually 45 or 60 minutes
  capacity: number;
  spotsAvailable: number;
  bookingUrl: string;
  price: number;                   // Or credits
  difficulty?: string;
  bikeType?: string;               // Regular or SPINPower
  music?: string;                  // Music genre/theme
  description?: string;
}
```

### Integration Points

**Provider registration in `src/index.ts`:**
```typescript
providers.set('soulcycle', new SoulCycleProvider(chromeManager, soulcycleConfig));
```

**CLI usage:**
```bash
# Scrape SoulCycle only
npm run scrape -- scrape -p soulcycle -m 50 --no-upload

# Scrape specific location
npm run scrape -- scrape -p soulcycle -l "new-york" -m 50 --no-upload

# Scrape date range
npm run scrape -- scrape -p soulcycle --start-date 2025-11-25 --end-date 2025-11-30
```

---

## 🚨 Known Issues & Warnings

### Issue 1: URL Format Changed
- **Problem:** Old documentation uses `soulcycle.com/find-a-class`
- **Solution:** Use `soul-cycle.com` (with hyphen)

### Issue 2: Proprietary Booking System
- **Impact:** Can't leverage existing Mindbody/Mariana Tek integrations
- **Solution:** Must reverse-engineer their custom API

### Issue 3: Potential Authentication
- **Risk:** Class schedules may require login
- **Mitigation:** Test public pages first, implement auth if needed

### Issue 4: Rate Limiting
- **Current setting:** 15 requests/min
- **Action:** Monitor for 429 errors, adjust as needed

---

## 📚 Reference Materials

### Created Investigation Scripts
All located in: `/Users/josephmalone/IdeaProjects/numina-scrapers/`

1. `inspect-soulcycle.mjs` - Original inspection (outdated URLs)
2. `simple-soulcycle-check.mjs` - URL validation
3. `inspect-soulcycle-v2.mjs` - Updated inspection
4. `find-soulcycle-api.mjs` ⭐ - **Start here**

### Original Instructions
**File:** `SOULCYCLE_SCRAPER_INSTRUCTIONS.md`
- Comprehensive guide from project creator
- Step-by-step implementation instructions
- Common challenges and solutions

### Key URLs
- Main site: https://www.soul-cycle.com
- NYC studios: https://www.soul-cycle.com/studios/nyc/
- NoMad studio: https://www.soul-cycle.com/studios/ny-newyork-nomad/
- Class finder: https://www.soul-cycle.com/find-a-class/studio/20/
- Series/pricing: https://www.soul-cycle.com/series/

### Web Research Sources
- [SoulCycle Website](https://www.soul-cycle.com)
- [Well+Good: SoulCycle's New Booking System](https://www.wellandgood.com/soulcycle-has-a-new-booking-system-and-website/)

---

## 🎯 Success Criteria

Before marking this task complete, verify:

- [ ] Scraper runs without errors
- [ ] Extracts 50+ classes from NYC locations
- [ ] All required fields populated (name, instructor, datetime, location)
- [ ] Multiple instructors present in data
- [ ] Booking URLs work (even if login required)
- [ ] Data stored in database
- [ ] Can extend to multiple cities
- [ ] Documentation updated with:
  - [ ] Authentication method (if needed)
  - [ ] Selectors/API endpoints used
  - [ ] Any limitations discovered
  - [ ] Rate limits encountered
  - [ ] Recommended scraping frequency
  - [ ] Sample output (5 classes)

---

## 💡 Quick Win Strategy

**If short on time, focus on:**

1. ✅ **Get 1 class scraped** from 1 studio
   - Proves the concept works
   - Can iterate from there

2. ✅ **Document the API/selector** you found
   - Future you will thank you
   - Makes it easy to extend later

3. ✅ **Test the data pipeline**
   - Ensure data reaches database
   - Verify format is correct

**Don't get stuck on:**
- ❌ Perfect error handling
- ❌ All 90+ studios
- ❌ Authentication edge cases
- ❌ Rate limit optimization

Get it working for one studio first, then scale!

---

## 🔄 Handover Checklist

Before ending your session, update this document with:

- [ ] API endpoints discovered (or "none found")
- [ ] Selectors that work (or "using API")
- [ ] Sample scraped class data
- [ ] Any blockers encountered
- [ ] Next recommended action
- [ ] Time estimate to completion

---

## 📝 Agent Notes Section

**For the next agent to fill in:**

### Session 2 Notes (Your notes here):
-
-
-

### Session 3 Notes:
-
-
-

---

## 🆘 If You Get Stuck

### Common Issues

**"Can't find class elements"**
- Try `find-soulcycle-api.mjs` to discover actual API
- Check if data is in `<script>` tags with `window.__INITIAL_STATE__`
- May need to wait for JavaScript to render

**"Getting 404 errors"**
- Confirm using `soul-cycle.com` (with hyphen)
- Check studio URL format: `/studios/{state-city-location}/`

**"No classes returned"**
- Check if login required
- Verify date range (may only show future classes)
- Try different studios

**"Authentication required"**
- See `SOULCYCLE_SCRAPER_INSTRUCTIONS.md` section on auth
- May need to implement cookie-based auth
- Consider using public class finder instead

### Resources
- Original instructions: `SOULCYCLE_SCRAPER_INSTRUCTIONS.md`
- Working providers: Check `BarrysProvider.ts`, `EquinoxProvider.ts` for examples
- Base functionality: `BaseProvider.ts`

---

**Good luck! The groundwork is done, now it's time to discover their API and make it work! 🚀**

_Last updated: 2025-11-25 by Claude (Session 1)_
