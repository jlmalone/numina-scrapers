# Agent Task 018: Add Crunch Fitness Provider

## Completion Check
```bash
[ -f .claude/completed/018 ] && echo "✅ Already complete" && exit 0
```

## Task: Implement Crunch Fitness Scraper

Add a new provider adapter for Crunch Fitness, a national gym chain with unique classes.

### Implementation Requirements

**File:** `src/providers/CrunchFitnessProvider.ts`

Extend `BaseProvider` and implement:

1. **Provider Configuration**
   - Name: `crunch`
   - Base URL: `https://www.crunch.com`
   - Schedule page: `/locations/[location-id]/schedule`

2. **Scraping Logic**
   - Navigate to club schedule page
   - Extract class data: name, time, instructor, duration, room
   - Handle multi-location support
   - Parse signature class types (Ride, Zumba, BodyWeb, etc.)

3. **Data Extraction**
   - Class name and type
   - Date/time information
   - Instructor name and bio (if available)
   - Room/studio location
   - Class capacity and availability
   - Special features (live DJ, themed classes)

4. **Integration**
   - Add to provider map in `src/index.ts`
   - Add config to `config/providers.example.json`
   - Follow existing provider patterns

### Code Template

```typescript
import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';

export class CrunchFitnessProvider extends BaseProvider {
  readonly name = 'crunch';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];
    const page = await this.chromeManager.newPage();

    try {
      // Implementation here
      const locationUrl = `${this.config.baseUrl}/locations/${options.location || 'default'}/schedule`;
      await this.chromeManager.navigateWithRetry(page, locationUrl);

      // Wait for schedule
      await page.waitForSelector('.schedule-item', { timeout: 10000 });

      // Extract classes
      // ... implementation ...

      return this.createScrapeResult(classes, true, errors);
    } catch (error) {
      this.logError('Crunch Fitness scraping failed', error);
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
npm run scrape -- --provider=crunch --max-results=20
```

### Completion

When done:
1. Test scraper works and returns classes
2. Create completion marker: `touch .claude/completed/018`
3. Commit changes
4. Push to branch: `claude/task-018`

## Complete Code Required

Provide the full, working implementation of CrunchFitnessProvider.ts with all necessary imports and error handling.
