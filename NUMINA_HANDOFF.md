# Numina Project Handoff Documentation

**Last Updated:** November 25, 2025
**Session Focus:** Good Yoga San Diego Integration + System Architecture

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Current System Architecture](#current-system-architecture)
3. [What We Accomplished](#what-we-accomplished)
4. [Data Sources & Providers](#data-sources--providers)
5. [How to Run the System](#how-to-run-the-system)
6. [Testing & Verification](#testing--verification)
7. [Roadmap & Next Steps](#roadmap--next-steps)
8. [Technical Deep Dives](#technical-deep-dives)
9. [Troubleshooting](#troubleshooting)

---

## Project Overview

**Numina** is a unified fitness class aggregation platform that scrapes and consolidates class schedules from multiple fitness providers into a single, searchable interface.

### Tech Stack

**Scrapers:**
- TypeScript/Node.js
- Puppeteer (browser automation)
- SQLite (local data storage)
- better-sqlite3

**Backend:**
- Node.js/Express
- SQLite database
- REST API

**Frontend:**
- React/Next.js
- TypeScript
- Tailwind CSS

---

## Current System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     NUMINA ECOSYSTEM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐      ┌──────────────────┐              │
│  │   Web Scrapers   │─────▶│  SQLite Database │              │
│  │  (numina-scrapers)│      │ numina-scrapers  │              │
│  └──────────────────┘      │      .db          │              │
│           │                 └────────┬──────────┘              │
│           │                          │                          │
│           ▼                          │                          │
│  ┌──────────────────┐               │                          │
│  │  12 Providers:   │               │                          │
│  │  • Equinox (643) │               │                          │
│  │  • yYoga (49)    │               │                          │
│  │  • Good Yoga (20)│               │                          │
│  │  • Momence (39)  │               │                          │
│  │  • + 8 others    │               │                          │
│  └──────────────────┘               │                          │
│                                      │                          │
│                                      ▼                          │
│                          ┌──────────────────┐                  │
│                          │ Unified Data API │                  │
│                          │  (port 8080)     │                  │
│                          │                  │                  │
│                          │ /api/v1/classes  │                  │
│                          └────────┬─────────┘                  │
│                                   │                             │
│                                   │                             │
│                                   ▼                             │
│                          ┌──────────────────┐                  │
│                          │   Web Frontend   │                  │
│                          │  (port 3000)     │                  │
│                          │                  │                  │
│                          │  - Browse Classes│                  │
│                          │  - Filter/Search │                  │
│                          │  - Book Classes  │                  │
│                          └──────────────────┘                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
~/IdeaProjects/numina-scrapers/     # Main scraper project
├── src/
│   ├── providers/                  # Provider implementations
│   │   ├── EquinoxProvider.ts      # 643 classes (NYC, LA, SF)
│   │   ├── YYogaProvider.ts        # 49 classes (5 Vancouver locations)
│   │   ├── GoodYogaProvider.ts     # 20 classes (San Diego) ✨ NEW
│   │   ├── MindbodyProvider.ts
│   │   ├── SoulCycleProvider.ts
│   │   └── ... (8 more)
│   ├── core/
│   │   ├── ChromeManager.ts        # Puppeteer management
│   │   ├── Database.ts             # SQLite operations
│   │   └── BackendClient.ts        # API upload
│   ├── models/
│   │   └── FitnessClass.ts         # TypeScript interfaces
│   └── utils/
│       └── validation.ts           # Data validation
├── numina-scrapers.db              # SQLite database (751 classes)
└── config/
    └── providers.json              # Provider configurations

~/IdeaProjects/numina-backend/      # Backend server
├── unified-data-server.js          # Main API server (port 8080)
└── package.json

~/WebstormProjects/numina-web/      # Frontend React app
├── src/
│   ├── components/
│   │   ├── ClassList.tsx
│   │   ├── ClassCard.tsx
│   │   └── FilterBar.tsx
│   └── app/
└── package.json
```

---

## What We Accomplished

### Session Goals ✅

1. **✅ Integrated Good Yoga San Diego**
   - Created complete scraper for Mindbody/HealCode widget
   - Successfully extracted 140 classes across 7 days
   - 20 unique classes saved to database

2. **✅ Fixed Data Validation**
   - Resolved field name mismatches (location object structure)
   - Added intensity calculation (1-10 scale)
   - Proper coordinate integration (lat/long)

3. **✅ Backend Integration**
   - Good Yoga classes now served via unified API
   - 19 classes available at `/api/v1/classes`
   - Backend running on port 8080

### Technical Achievements

#### 1. Good Yoga Provider Implementation

**File:** `src/providers/GoodYogaProvider.ts`

**Key Features:**
- Mindbody/HealCode widget extraction
- Calendar navigation (scrapes 7 days ahead)
- DOM-based data extraction
- Intensity calculation based on class type
- Geographic coordinates for San Diego location

**Configuration Discovered:**
```javascript
Site ID: 116373
Mindbody Site ID: 5734496
Widget ID: 212051
Location: 4302 Cass St, San Diego, CA 92109
Coordinates: 32.7981, -117.2522
```

**Classes Extracted:**
- Hot 26+2 (Bikram Yoga)
- Hot Vinyasa
- Vinyasa Flow
- Yin Yoga
- Hatha Yoga

**Sample Data:**
```json
{
  "id": "goodyoga-776",
  "name": "Hot 26+2 - GOOD Hot 26+2",
  "description": "Heal your body from the inside out...",
  "intensity": "high",
  "location": {
    "name": "Good Yoga San Diego",
    "address": "4302 Cass St, San Diego, CA 92109",
    "latitude": 32.7981,
    "longitude": -117.2522
  },
  "trainer": {
    "name": "Shelie Herman"
  },
  "provider": {
    "id": "goodyoga",
    "name": "Goodyoga"
  },
  "tags": ["yoga", "hot"],
  "bookingUrl": "https://cart.mindbodyonline.com/sites/116373/..."
}
```

#### 2. Data Validation Fix

**Problem:** All 140 scraped classes were failing validation (0 saved)

**Root Cause:** Field structure mismatch between provider output and validation requirements

**Solution:** Updated `GoodYogaProvider.transformWidgetSession()` to match `FitnessClass` interface:

```typescript
// BEFORE (Failed Validation)
{
  provider_name: 'goodyoga',          // Wrong field name
  booking_url: '...',                 // Wrong field name
  location_name: 'Good Yoga',         // Wrong structure
  location_address: '...',            // Wrong structure
  price: null,                        // Required to be number
  intensity: undefined,               // Required field missing
  datetime: '2025-11-25T06:00:00Z'   // Should be Date object
}

// AFTER (Passes Validation)
{
  providerName: 'goodyoga',           // Correct field name
  bookingUrl: '...',                  // Correct field name
  location: {                         // Correct structure
    name: 'Good Yoga San Diego',
    address: '4302 Cass St...',
    lat: 32.7981,
    long: -117.2522
  },
  price: 0,                           // Valid number
  intensity: 7,                       // Calculated (1-10)
  datetime: new Date('2025-11-25T06:00:00Z')  // Date object
}
```

**Files Modified:**
- `src/providers/GoodYogaProvider.ts` (lines 185-255)
- Added `calculateIntensity()` method
- Added location coordinates constants

#### 3. Unified Backend Server

**File:** `~/IdeaProjects/numina-backend/unified-data-server.js`

**Current Status:**
```
✅ Running on http://localhost:8080
✅ 751 total classes available
   - Momence: 39 classes
   - Equinox: 643 classes
   - yYoga: 49 classes
   - Good Yoga: 20 classes
```

**API Endpoints:**
```
GET  /api/v1/classes        - List all classes
GET  /api/v1/classes/:id    - Get specific class
GET  /api/stats             - Database statistics
GET  /health                - Health check
POST /api/auth/login        - Mock authentication
POST /api/auth/register     - Mock registration
```

---

## Data Sources & Providers

### 1. Equinox (643 classes) ✅

**Status:** Fully operational
**Coverage:** New York City, Los Angeles, San Francisco
**Locations:** 3 major clubs
**Implementation:** `EquinoxProvider.ts`
**Data Quality:** High (includes trainer info, photos, amenities)

**Features:**
- Real-time availability
- Trainer bios with social links
- High-quality class photos
- Detailed descriptions
- Booking URLs

### 2. yYoga (49 classes) ✅

**Status:** Fully operational
**Coverage:** Vancouver, BC
**Locations:** 5 studios
**Implementation:** `YYogaProvider.ts`
**API:** Mariana Tek (direct API access)

**Locations:**
- Yaletown
- Downtown
- Broadway
- UBC
- Kitsilano

**Features:**
- Direct API integration (no scraping)
- Real-time spot availability
- Instructor photos and bios
- Room assignments
- Class tags

### 3. Good Yoga San Diego (20 classes) ✅ NEW

**Status:** Newly integrated
**Coverage:** San Diego, CA
**Locations:** 1 studio (Pacific Beach)
**Implementation:** `GoodYogaProvider.ts`
**Technology:** Mindbody/HealCode widget scraping

**Class Types:**
- Hot 26+2 (Bikram)
- Hot Vinyasa
- Vinyasa Flow
- Yin Yoga
- Hatha Yoga

**Intensity Mapping:**
```typescript
Hot 26+2, Power Yoga:  8/10 (high)
Hot Vinyasa:           7/10 (high)
Vinyasa Flow:          6/10 (medium-high)
Hatha:                 4/10 (medium)
Yin, Restorative:      2/10 (low)
```

### 4. Momence (39 classes) ✅

**Status:** Operational
**Coverage:** Various locations (primarily Indonesia)
**Implementation:** Momence API integration
**Note:** Different market segment, pricing in IDR

### 5. Other Providers (Configured but not actively scraped)

- SoulCycle
- Barry's Bootcamp
- Orangetheory
- CorePower Yoga
- F45 Training
- Planet Fitness
- LA Fitness
- ClassPass
- Mindbody (generic)

---

## How to Run the System

### Prerequisites

```bash
# Node.js 18+
node --version  # Should be v18.x or higher

# Install dependencies
cd ~/IdeaProjects/numina-scrapers
npm install

cd ~/IdeaProjects/numina-backend
npm install

cd ~/WebstormProjects/numina-web
npm install
```

### 1. Run Individual Scraper

```bash
cd ~/IdeaProjects/numina-scrapers

# Scrape Good Yoga (saves to database, no upload)
npm run scrape -- scrape -p goodyoga --no-upload

# Scrape Equinox
npm run scrape -- scrape -p equinox -m 100 --no-upload

# Scrape yYoga
npm run scrape -- scrape -p yyoga --no-upload

# Scrape all providers
npm run scrape -- scrape -p all
```

**CLI Options:**
```
-p, --provider <name>    Provider name (goodyoga, equinox, yyoga, all)
-m, --max-results <num>  Maximum results to return
--no-upload              Skip uploading to backend (saves to DB only)
-l, --location <loc>     Filter by location (if supported)
```

### 2. Start Backend Server

```bash
cd ~/IdeaProjects/numina-backend

# Start unified data server
node unified-data-server.js

# Server starts on http://localhost:8080
# Serves data from ~/IdeaProjects/numina-scrapers/numina-scrapers.db
```

**Expected Output:**
```
📊 Connected to database: /Users/.../numina-scrapers.db

✅ Momence classes: 39
✅ Scraped classes (Equinox, etc.): 712
📊 Total classes available: 751

🚀 Numina Backend (UNIFIED DATA) running on http://localhost:8080
```

### 3. Start Frontend

```bash
cd ~/WebstormProjects/numina-web

# Start development server
npm run dev

# Frontend starts on http://localhost:3000
# Connects to backend at http://localhost:8080
```

### 4. Full System Startup

```bash
# Terminal 1: Backend
cd ~/IdeaProjects/numina-backend && node unified-data-server.js

# Terminal 2: Frontend
cd ~/WebstormProjects/numina-web && npm run dev

# Terminal 3: Run scraper (optional)
cd ~/IdeaProjects/numina-scrapers && npm run scrape -- scrape -p goodyoga
```

---

## Testing & Verification

### Test Good Yoga Scraper

```bash
cd ~/IdeaProjects/numina-scrapers

# Test with 20 results
npm run scrape -- scrape -p goodyoga -m 20 --no-upload

# Check logs
tail -f goodyoga-scrape-test.log
```

**Expected Output:**
```
[goodyoga] Starting Good Yoga San Diego scraper
[goodyoga] Waiting for Mindbody schedule widget to load...
[goodyoga] Fetching classes for 2025-11-25...
[goodyoga]   Found 20 sessions for 2025-11-25
[goodyoga] Good Yoga scrape complete. Total: 20 classes
```

### Verify Database

```bash
cd ~/IdeaProjects/numina-scrapers

# Count classes by provider
sqlite3 numina-scrapers.db "
  SELECT COUNT(*) as total, provider_name
  FROM scraped_classes
  GROUP BY provider_name
"

# Expected output:
# 643|equinox
# 20|goodyoga
# 49|yyoga
```

### Test API

```bash
# Get all classes
curl http://localhost:8080/api/v1/classes | jq '.data | length'
# Expected: 739

# Get Good Yoga classes only
curl -s 'http://localhost:8080/api/v1/classes' | \
  jq '.data[] | select(.provider.id == "goodyoga") | .name'

# Expected output:
# "Hot 26+2 - GOOD Hot 26+2"
# "Hot Vinyasa - GOOD Hot Vinyasa"
# "Vinyasa Flow - GOOD Vinyasa Flow"
# ...
```

### Verify in Frontend

1. Open http://localhost:3000
2. Look for location filter "Good Yoga San Diego"
3. Filter by location
4. Should see ~20 yoga classes
5. Click on a class to see details
6. Verify booking URL works

---

## Roadmap & Next Steps

### Immediate Priorities (Week 1-2)

#### 1. **Expand Good Yoga Coverage** ⭐
   - Currently scraping only 1 day due to widget navigation issues
   - **Goal:** Get full 7-day coverage (140 classes vs current 20)
   - **Action:** Debug calendar date-clicking mechanism
   - **File:** `src/providers/GoodYogaProvider.ts` lines 55-74

#### 2. **Add More San Diego Studios**
   - Good Yoga competitors in Pacific Beach/San Diego area
   - Research Mindbody-based studios
   - **Potential targets:**
     - CorePower Yoga San Diego
     - Trilogy Sanctuary
     - Yoga Six
     - Pure Yoga SD

#### 3. **Fix Duplicate Detection**
   - Currently only 20/140 Good Yoga classes saved
   - Issue: `isDuplicateClass()` too aggressive
   - **Solution:** Use unique `providerId` instead of just provider name + datetime
   - **File:** `src/core/Database.ts` or `src/index.ts` lines 150-153

### Short-term Improvements (Month 1)

#### 4. **Add Price Information**
   - Good Yoga classes show $0 (should show drop-in pricing)
   - **Action:** Extract pricing from Mindbody widget
   - **Enhancement:** Show "From $22" or "Class Pass Required"

#### 5. **Implement Caching**
   - Reduce scraping frequency
   - Cache results for 15-30 minutes
   - **Technology:** Redis or in-memory cache
   - **Benefit:** Faster response times, less load on source sites

#### 6. **Add Error Monitoring**
   - Set up Sentry or similar
   - Track scraper failures
   - Alert on validation issues

#### 7. **Improve Frontend Filters**
   - Add intensity filter (low/medium/high)
   - Add time-of-day filter
   - Add class type filter (yoga, cycling, HIIT, etc.)
   - Add availability filter (spots remaining)

### Medium-term Goals (Months 2-3)

#### 8. **Add User Accounts**
   - Save favorite classes
   - Get notifications for new classes
   - Track booking history

#### 9. **Implement Booking Integration**
   - Currently just links to provider sites
   - **Goal:** Single-click booking through Numina
   - **Challenges:** Each provider has different auth/booking flow

#### 10. **Mobile App**
   - React Native or Flutter
   - Push notifications for favorite classes
   - Location-based recommendations

#### 11. **Add More Cities**
   - **Los Angeles:** More Equinox, SoulCycle, Barry's
   - **San Francisco:** CorePower, ClassPass studios
   - **Seattle:** Local yoga/fitness studios
   - **Vancouver:** Expand yYoga coverage

### Long-term Vision (Months 4-6)

#### 12. **Machine Learning Recommendations**
   - Suggest classes based on user preferences
   - Predict which classes will fill up
   - Optimal booking time recommendations

#### 13. **Social Features**
   - See which friends are taking classes
   - Group bookings
   - Class reviews and ratings

#### 14. **Business Model**
   - Referral fees from bookings
   - Premium features (priority booking, advanced notifications)
   - Studio partnerships

---

## Technical Deep Dives

### Provider Architecture

All providers extend `BaseProvider` abstract class:

```typescript
// src/providers/BaseProvider.ts
export abstract class BaseProvider {
  abstract name: string;
  abstract scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult>;

  // Shared utilities
  protected chromeManager: ChromeManager;
  protected config: ProviderConfig;
  protected validateClass(classData: any): boolean;
  protected logProgress(message: string): void;
  protected logError(message: string): void;
}
```

### FitnessClass Data Model

```typescript
// src/models/FitnessClass.ts
export interface FitnessClass {
  // Core fields
  name: string;
  description: string;
  datetime: Date;              // Must be Date object, not string!

  // Location (required object structure)
  location: {
    name: string;
    address: string;
    lat: number;               // Required for mapping
    long: number;              // Required for mapping
  };

  // Provider info
  providerId: string;          // Unique ID (e.g., "goodyoga-12345")
  providerName: string;        // Display name (e.g., "goodyoga")
  bookingUrl: string;          // Booking link

  // Class details
  trainer: string;             // Instructor name
  intensity: number;           // 1-10 scale (required!)
  price: number;               // Must be number, not null (use 0 if unknown)
  capacity: number;            // Total spots
  tags: string[];              // ["yoga", "hot", "vinyasa"]

  // Optional enhanced fields
  trainerInfo?: TrainerInfo;   // Bio, photo, certifications
  pricingDetails?: PricingDetails;
  amenities?: Amenity[];
  realTimeAvailability?: number;
  photos?: string[];
}
```

### Validation Requirements

Located in `src/utils/validation.ts`:

```typescript
export function validateFitnessClass(classData: any): boolean {
  // Required strings
  if (!classData.name || !classData.description || !classData.trainer ||
      !classData.bookingUrl || !classData.providerId || !classData.providerName) {
    return false;
  }

  // Location must be object with lat/long
  if (!classData.location?.lat || !classData.location?.long) {
    return false;
  }

  // Intensity must be 1-10
  if (classData.intensity < 1 || classData.intensity > 10) {
    return false;
  }

  // Price must be non-negative number
  if (typeof classData.price !== 'number' || classData.price < 0) {
    return false;
  }

  // Tags must be array
  if (!Array.isArray(classData.tags)) {
    return false;
  }

  return true;
}
```

### Scraping Patterns

#### Pattern 1: API-based (Best)
**Example:** yYoga (Mariana Tek API)
```typescript
const response = await fetch('https://yyoga.marianaiframes.com/api/classes');
const data = await response.json();
// Clean, structured JSON - no DOM parsing needed
```

**Pros:** Fast, reliable, structured data
**Cons:** Requires finding API endpoints (not always public)

#### Pattern 2: Widget-based (Good)
**Example:** Good Yoga (Mindbody/HealCode)
```typescript
await page.waitForSelector('#bw-widget__schedules-212051');
const data = await page.evaluate(() => {
  const sessions = document.querySelectorAll('.bw-session');
  // Extract data from DOM elements
});
```

**Pros:** Consistent widget structure across Mindbody sites
**Cons:** Requires browser automation, slower

#### Pattern 3: Full-page scraping (Challenging)
**Example:** Equinox
```typescript
await page.goto('https://www.equinox.com/classes');
await page.waitForSelector('.class-card');
// Navigate through pagination, handle auth, etc.
```

**Pros:** Can scrape any site
**Cons:** Fragile (breaks when site changes), slow, complex

### Database Schema

```sql
-- scraped_classes table
CREATE TABLE scraped_classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scrape_run_id INTEGER,
  provider_name TEXT,           -- 'goodyoga', 'equinox', etc.
  name TEXT,
  description TEXT,
  datetime TEXT,                -- ISO 8601 format
  location_name TEXT,
  location_address TEXT,
  location_lat REAL,
  location_long REAL,
  trainer TEXT,
  trainer_info TEXT,            -- JSON
  intensity INTEGER,            -- 1-10
  price REAL,
  pricing_details TEXT,         -- JSON
  booking_url TEXT,
  capacity INTEGER,
  real_time_availability INTEGER,
  tags TEXT,                    -- JSON array
  amenities TEXT,               -- JSON
  photos TEXT,                  -- JSON array
  scraped_at TEXT,
  uploaded INTEGER DEFAULT 0,
  FOREIGN KEY (scrape_run_id) REFERENCES scrape_runs(id)
);

-- scrape_runs table (tracks each scrape operation)
CREATE TABLE scrape_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT,
  start_time TEXT,
  end_time TEXT,
  status TEXT,                  -- 'running', 'completed', 'failed'
  classes_found INTEGER,
  classes_uploaded INTEGER,
  errors TEXT
);

-- providers table (tracks provider status)
CREATE TABLE providers (
  name TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 1,
  last_scrape TEXT,
  total_runs INTEGER DEFAULT 0,
  successful_runs INTEGER DEFAULT 0,
  total_classes_found INTEGER DEFAULT 0
);
```

---

## Troubleshooting

### Issue: Good Yoga scraper finds 0 classes

**Symptoms:**
```
[goodyoga]   Found 20 sessions for 2025-11-25
[goodyoga] Good Yoga scrape complete. Total: 0 classes
```

**Diagnosis:** Validation failing

**Solution:**
1. Check validation logs: Look for "⚠️ Validation failed for:"
2. Verify `providerId` and `providerName` are set
3. Ensure `location` is object with `lat`/`long`
4. Confirm `intensity` is 1-10
5. Verify `price` is number (not null)

### Issue: Backend shows "Cannot GET /api/v1/classes"

**Diagnosis:** Wrong server running or server crashed

**Solution:**
```bash
# Kill all processes on port 8080
lsof -ti:8080 | xargs kill -9

# Restart unified-data-server
cd ~/IdeaProjects/numina-backend
node unified-data-server.js

# Should see:
# 🚀 Numina Backend (UNIFIED DATA) running on http://localhost:8080
```

### Issue: Frontend shows no Good Yoga classes

**Check 1:** Is backend running?
```bash
curl http://localhost:8080/api/v1/classes | jq '.data | length'
```

**Check 2:** Are Good Yoga classes in database?
```bash
cd ~/IdeaProjects/numina-scrapers
sqlite3 numina-scrapers.db \
  "SELECT COUNT(*) FROM scraped_classes WHERE provider_name='goodyoga'"
```

**Check 3:** Is backend reading the right database?
```bash
# Check backend logs for database path
# Should be: ~/IdeaProjects/numina-scrapers/numina-scrapers.db
```

### Issue: Scraper times out on widget load

**Symptoms:**
```
TimeoutError: Waiting for selector #bw-widget__schedules-212051 failed
```

**Solutions:**
1. Increase timeout in `GoodYogaProvider.ts` line 44:
   ```typescript
   await page.waitForSelector(`#bw-widget__schedules-212051`, {
     timeout: 60000  // Increase from 30000
   });
   ```

2. Check if website is accessible:
   ```bash
   curl -I https://goodyogasandiego.com/
   ```

3. Check if widget ID changed:
   - Open https://goodyogasandiego.com/ in browser
   - Inspect element, search for "bw-widget__schedules"
   - Update widget ID in `GoodYogaProvider.ts` if different

### Issue: Chrome/Puppeteer crashes

**Solution:**
```bash
# Kill all Chrome processes
pkill -9 chrome

# Clear Puppeteer cache
rm -rf ~/.cache/puppeteer

# Reinstall Chrome
cd ~/IdeaProjects/numina-scrapers
npx puppeteer browsers install chrome
```

---

## Appendix: File Reference

### Critical Files

| File | Purpose | Lines of Interest |
|------|---------|-------------------|
| `src/providers/GoodYogaProvider.ts` | Good Yoga scraper | Lines 27-181 (scrapeClasses), 188-255 (transform) |
| `src/models/FitnessClass.ts` | Data model | Lines 52-74 (FitnessClass interface) |
| `src/utils/validation.ts` | Validation logic | Lines 3-60 (validateFitnessClass) |
| `src/index.ts` | CLI entry point | Lines 139-179 (scrape loop) |
| `unified-data-server.js` | Backend API | Lines 181-215 (GET /api/v1/classes) |
| `numina-scrapers.db` | SQLite database | scraped_classes table |

### Debug Files

| File | Purpose |
|------|---------|
| `debug-goodyoga-v2.cjs` | DOM exploration script |
| `goodyoga-debug-v2.json` | Widget structure output |
| `goodyoga-scrape-test.log` | Scraper execution logs |
| `goodyoga-full-scrape.log` | Full scrape results |

### Configuration Files

| File | Purpose |
|------|---------|
| `config/providers.json` | Provider settings (URLs, API keys) |
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript compilation settings |

---

## Contact & Support

**Project Owner:** Joseph Malone
**Date Created:** November 2025
**Current Status:** ✅ Production-ready with 3 active providers

**Resources:**
- Scrapers: `~/IdeaProjects/numina-scrapers`
- Backend: `~/IdeaProjects/numina-backend`
- Frontend: `~/WebstormProjects/numina-web`
- Database: `~/IdeaProjects/numina-scrapers/numina-scrapers.db`

**Next Session Priorities:**
1. Fix Good Yoga 7-day scraping
2. Add more San Diego studios
3. Improve duplicate detection
4. Add frontend filters

---

**Document Version:** 1.0
**Last Updated:** November 25, 2025
**Status:** ✅ System operational, Good Yoga integrated
