# Agent Task 017: Add 24 Hour Fitness Provider

## Completion Check
```bash
[ -f .claude/completed/017 ] && echo "✅ Already complete" && exit 0
```

## Task: Implement 24 Hour Fitness Scraper

Add a new provider adapter for 24 Hour Fitness, a large national gym chain offering group fitness classes.

### Implementation Requirements

**File:** `src/providers/TwentyFourHourFitnessProvider.ts`

Extend `BaseProvider` and implement:

1. **Provider Configuration**
   - Name: `24hourfitness`
   - Base URL: `https://www.24hourfitness.com`
   - Schedule page: `/schedules`

2. **Scraping Logic**
   - Navigate to club/location schedule page
   - Extract class data: name, time, instructor, duration, capacity
   - Handle location-based filtering
   - Parse class types and intensity levels

3. **Data Extraction**
   - Class name and description
   - Date/time information
   - Instructor details
   - Studio/room location within club
   - Class capacity
   - Booking availability

4. **Integration**
   - Add to provider map in `src/index.ts`
   - Add config to `config/providers.example.json`
   - Follow existing provider patterns

### Code Template

```typescript
import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';

export class TwentyFourHourFitnessProvider extends BaseProvider {
  readonly name = '24hourfitness';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];
    const page = await this.chromeManager.newPage();

    try {
      // Implementation here
      await this.chromeManager.navigateWithRetry(
        page,
        `${this.config.baseUrl}/schedules`
      );

      // Wait for schedule to load
      await page.waitForSelector('.class-schedule', { timeout: 10000 });

      // Extract classes
      // ... implementation ...

      return this.createScrapeResult(classes, true, errors);
    } catch (error) {
      this.logError('24 Hour Fitness scraping failed', error);
      return this.createScrapeResult(classes, false, [String(error)]);
    } finally {
      await this.chromeManager.closePage(page);
    }
  }
}
```

### Testing

```bash
npm run build
npm run scrape -- --provider=24hourfitness --max-results=20
```

### Completion

When done:
1. Test scraper works and returns classes
2. Create completion marker: `touch .claude/completed/017`
3. Commit changes
4. Push to branch: `claude/task-017`

## Complete Code Required

Provide the full, working implementation of TwentyFourHourFitnessProvider.ts with all necessary imports and error handling.
