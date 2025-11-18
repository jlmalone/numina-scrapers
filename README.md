# Numina Scrapers

TypeScript/Node.js service for scraping and aggregating fitness class data from various providers (gyms, studios, and booking platforms), then pushing it to the Numina backend API.

## Features

- **Modular Provider Architecture**: Easy-to-extend adapter pattern for adding new fitness class providers
- **Browser Automation**: Puppeteer-based scraping with retry logic and rate limiting
- **SQLite Tracking**: Local database for scraping operations, deduplication, and statistics
- **Backend Integration**: Batch uploads to numina-backend API with error handling
- **CLI Interface**: Command-line tool for manual and scheduled scraping
- **Automated Scheduling**: Cron-based scheduler for daily/periodic scraping
- **Geocoding**: Automatic address-to-coordinates conversion using OpenStreetMap
- **Comprehensive Logging**: Winston-based logging with file and console outputs

### Enhanced Data Extraction

Scrapers now extract richer data beyond basic class information:

- **📸 Class Photos**: Multiple images per class (up to 5)
- **👤 Detailed Trainer Info**: Bios, certifications, experience, photos, and social links
- **🏢 Facility Amenities**: Showers, lockers, parking, WiFi, childcare, equipment
- **⏰ Real-Time Availability**: Current spots available, booking status, waitlist info
- **💰 Pricing Details**: Drop-in prices, packages, intro offers, memberships
- **⭐ Reviews**: User ratings and reviews (when available from provider sites)

## Status

✅ **Implemented** - Core scraping infrastructure with 3 provider adapters

## Quick Start

### Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Copy and configure providers
cp config/providers.example.json config/providers.json
# Edit config/providers.json with your settings
```

### Configuration

Edit `config/providers.json`:

```json
{
  "backendUrl": "http://your-backend-url:3000",
  "backendApiKey": "your-api-key",
  "providers": {
    "mindbody": {
      "enabled": true,
      "baseUrl": "https://clients.mindbodyonline.com",
      "defaultLocation": "New York, NY"
    }
  }
}
```

### Usage

```bash
# Scrape from a specific provider
npm run scrape -- --provider=mindbody

# Scrape from all enabled providers
npm run scrape -- --provider=all

# Scrape with filters
npm run scrape -- --provider=equinox --location="new-york" --max-results=100

# Scrape with date range
npm run scrape -- --provider=classpass --start-date=2024-01-01 --end-date=2024-01-31

# Start scheduled scraping (runs daily at 2am by default)
npm run scrape -- schedule

# View statistics
npm run scrape -- stats

# Upload pending classes to backend
npm run scrape -- upload
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Interface                         │
│                        (src/index.ts)                        │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│ ChromeManager│ │ Database │ │BackendClient │
│  (Puppeteer) │ │ (SQLite) │ │  (API Calls) │
└──────┬───────┘ └────┬─────┘ └──────┬───────┘
       │              │                │
       │         ┌────┴────┐          │
       │         │  Stats  │          │
       │         │ Tracking│          │
       │         └─────────┘          │
       ▼                               ▼
┌────────────────────────────┐  ┌──────────────┐
│     Provider Adapters      │  │Upload Results│
│  ┌──────────────────────┐  │  └──────────────┘
│  │  MindbodyProvider    │  │
│  │  EquinoxProvider     │  │
│  │  ClassPassProvider   │  │
│  └──────────────────────┘  │
└────────────────────────────┘
```

## Provider Adapters

### Implemented Providers

1. **Mindbody** (`MindbodyProvider`)
   - Major booking platform used by gyms and studios worldwide
   - Scrapes class schedules, instructor info, pricing, and availability

2. **Equinox** (`EquinoxProvider`)
   - Premium gym chain with high-end group fitness classes
   - Location-based schedule scraping

3. **ClassPass** (`ClassPassProvider`)
   - Multi-studio subscription service
   - Aggregates classes from various boutique fitness studios

### How Providers Work

Each provider extends `BaseProvider` and implements:

```typescript
class CustomProvider extends BaseProvider {
  readonly name = 'custom';

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    // 1. Navigate to schedule page
    // 2. Extract class elements
    // 3. Parse class data (name, time, location, trainer, etc.)
    // 4. Geocode addresses
    // 5. Validate and return results
  }
}
```

## Adding New Providers

### Step-by-Step Guide

1. **Create Provider File**

```bash
touch src/providers/YourProviderName.ts
```

2. **Implement Provider Class**

```typescript
import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';

export class YourProviderName extends BaseProvider {
  readonly name = 'yourprovider';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];
    const page = await this.chromeManager.newPage();

    try {
      // Navigate to schedule
      await this.chromeManager.navigateWithRetry(page, this.config.baseUrl);

      // Wait for class elements
      await page.waitForSelector('.class-item');

      // Extract classes
      const elements = await page.$$('.class-item');

      for (const element of elements) {
        // Extract data from each element
        const classData = await page.evaluate((el) => ({
          name: el.querySelector('.name')?.textContent?.trim(),
          time: el.querySelector('.time')?.textContent?.trim(),
          // ... more fields
        }), element);

        // Create FitnessClass object
        const fitnessClass: FitnessClass = {
          name: classData.name,
          datetime: this.parseDateTime(classData.date, classData.time),
          // ... populate all required fields
        };

        if (this.validateClass(fitnessClass)) {
          classes.push(fitnessClass);
        }
      }

      return this.createScrapeResult(classes, true, errors);
    } catch (error) {
      this.logError('Scraping failed', error);
      return this.createScrapeResult(classes, false, [String(error)]);
    } finally {
      await this.chromeManager.closePage(page);
    }
  }
}
```

3. **Register Provider**

Add to `src/index.ts`:

```typescript
import { YourProviderName } from './providers/YourProviderName.js';

// In initializeProviders():
const yourProviderConfig = config.providers?.yourprovider || {
  enabled: true,
  baseUrl: 'https://yourprovider.com'
};
providers.set('yourprovider', new YourProviderName(chromeManager, yourProviderConfig));
```

4. **Add Configuration**

Update `config/providers.json`:

```json
{
  "providers": {
    "yourprovider": {
      "enabled": true,
      "baseUrl": "https://yourprovider.com/schedule",
      "defaultLocation": "San Francisco, CA",
      "rateLimit": 10
    }
  }
}
```

5. **Test Your Provider**

```bash
npm run scrape -- --provider=yourprovider --max-results=10
```

## Data Model

### Core FitnessClass Fields

```typescript
interface FitnessClass {
  // Basic fields
  name: string;                    // Class name (e.g., "Hot Yoga", "Spin Class")
  description: string;             // Full description
  datetime: Date;                  // Class start time
  location: Location;              // Venue details with geocoded coordinates
  trainer: string;                 // Instructor name (for backward compatibility)
  intensity: number;               // 1-10 scale
  price: number;                   // Price in dollars (for backward compatibility)
  bookingUrl: string;              // URL to book the class
  providerId: string;              // Unique ID from provider
  providerName: string;            // Provider name
  capacity: number;                // Max participants
  tags: string[];                  // ["yoga", "hot", "beginner"]

  // Enhanced fields
  photos?: string[];               // Array of photo URLs (up to 5)
  trainerInfo?: TrainerInfo;       // Detailed trainer information
  amenities?: Amenity[];           // Facility amenities
  realTimeAvailability?: number;   // Current spots available
  bookingStatus?: 'open' | 'closed' | 'full' | 'waitlist';
  lastAvailabilityCheck?: Date;    // Last time availability was checked
  pricingDetails?: PricingDetails; // Detailed pricing options
  reviews?: Review[];              // User reviews (if available)
}

interface TrainerInfo {
  name: string;
  bio?: string;
  certifications?: string[];
  yearsExperience?: number;
  photoUrl?: string;
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
    website?: string;
  };
}

interface Amenity {
  type: string;                    // shower, locker, parking, wifi, childcare, equipment
  available: boolean;
  description?: string;
}

interface PricingDetails {
  dropIn?: number;
  packages?: Array<{
    name: string;
    price: number;
    classes: number;
  }>;
  introOffer?: {
    description: string;
    price: number;
  };
  membership?: {
    monthly: number;
    description?: string;
  };
}

interface Review {
  rating: number;                  // 1-5
  text?: string;
  date: Date;
  reviewerName?: string;
}
```

## CLI Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `scrape` | Scrape classes from providers | `npm run scrape -- --provider=mindbody` |
| `schedule` | Start scheduled scraping | `npm run scrape -- schedule --schedule="0 2 * * *"` |
| `stats` | View scraping statistics | `npm run scrape -- stats` |
| `upload` | Upload pending classes | `npm run scrape -- upload` |

### Scrape Options

- `--provider <name>`: Provider to scrape (mindbody, equinox, classpass, all)
- `--location <location>`: Location to search
- `--start-date <YYYY-MM-DD>`: Start date filter
- `--end-date <YYYY-MM-DD>`: End date filter
- `--max-results <number>`: Limit results
- `--no-upload`: Skip uploading to backend

## Scheduling

Set up automated daily scraping:

```bash
# Daily at 2am
npm run scrape -- schedule

# Custom schedule (every 6 hours)
npm run scrape -- schedule --schedule="0 */6 * * *"
```

Cron expression format:
```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sunday-Saturday)
│ │ │ │ │
* * * * *
```

## Database Schema

### Tables

1. **providers**: Track provider configuration and stats
2. **scrape_runs**: Log each scraping execution
3. **scraped_classes**: Store all scraped classes with upload status

### Deduplication

Classes are deduplicated based on `providerId` + `datetime` to avoid re-scraping the same class.

## Backend Integration

The scraper pushes data to the `numina-backend` API:

- **Endpoint**: `POST /api/v1/classes`
- **Batch Size**: 50 classes per request
- **Authentication**: Bearer token (configurable)
- **Retry Logic**: Automatic retry with exponential backoff

## Best Practices for Scraping

1. **Respect robots.txt**: Check site's robots.txt before scraping
2. **Rate Limiting**: Use `rateLimit` config to avoid overwhelming servers
3. **Polite Delays**: Built-in random delays between requests
4. **Error Handling**: All providers include comprehensive error handling
5. **Logging**: All operations logged for debugging and monitoring
6. **Headless Mode**: Run Chrome in headless mode for production

## Troubleshooting

### Common Issues

1. **"Schedule not found" error**
   - Website structure may have changed
   - Inspect the page and update selectors in the provider

2. **Geocoding failures**
   - Rate limit on Nominatim API (1 req/sec)
   - Consider upgrading to Google Maps Geocoding API

3. **Classes not uploading**
   - Check backend URL and API key
   - View logs in `logs/error.log`

4. **Chrome crashes**
   - Increase system memory
   - Reduce concurrent scraping

## Development

```bash
# Install dependencies
npm install

# Run in dev mode (with hot reload)
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

## Project Structure

```
numina-scrapers/
├── src/
│   ├── index.ts                 # CLI entry point
│   ├── providers/               # Provider adapters
│   │   ├── BaseProvider.ts      # Base class for all providers
│   │   ├── MindbodyProvider.ts
│   │   ├── EquinoxProvider.ts
│   │   └── ClassPassProvider.ts
│   ├── core/                    # Core services
│   │   ├── ChromeManager.ts     # Puppeteer management
│   │   ├── Database.ts          # SQLite operations
│   │   ├── BackendClient.ts     # API client
│   │   └── Scheduler.ts         # Cron scheduling
│   ├── models/                  # TypeScript interfaces
│   │   └── FitnessClass.ts
│   └── utils/                   # Utilities
│       ├── logger.ts
│       ├── validation.ts
│       └── geocoding.ts
├── config/
│   └── providers.example.json   # Configuration template
├── tests/                       # Jest tests
├── logs/                        # Application logs
├── package.json
├── tsconfig.json
└── README.md
```

## Future Providers (See TODO.md)

- 24 Hour Fitness
- Planet Fitness
- LA Fitness
- SoulCycle
- Barry's Bootcamp
- Peloton Studios
- And 10+ more...

## License

MIT

---

**Numina Scrapers** - Aggregating fitness opportunities
