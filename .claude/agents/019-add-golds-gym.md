# Agent Task 019: Add Gold's Gym Provider

## Completion Check
```bash
[ -f .claude/completed/019 ] && echo "✅ Already complete" && exit 0
```

## Task: Implement Gold's Gym Scraper

Add a new provider adapter for Gold's Gym, a classic gym chain with extensive group classes.

### Implementation Requirements

**File:** `src/providers/GoldsGymProvider.ts`

Extend `BaseProvider` and implement:

1. **Provider Configuration**
   - Name: `goldsgym`
   - Base URL: `https://www.goldsgym.com`
   - Schedule page: `/gyms/[location]/group-fitness`

2. **Scraping Logic**
   - Navigate to gym location schedule page
   - Extract class data: name, time, instructor, style, level
   - Handle location-specific schedules
   - Parse various class formats (cycling, strength, yoga, cardio)

3. **Data Extraction**
   - Class name and format
   - Date/time information
   - Instructor credentials
   - Fitness level (beginner/intermediate/advanced)
   - Class duration
   - Studio/room assignment
   - Equipment needed

4. **Integration**
   - Add to provider map in `src/index.ts`
   - Add config to `config/providers.example.json`
   - Follow existing provider patterns

### Code Template

```typescript
import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';

export class GoldsGymProvider extends BaseProvider {
  readonly name = 'goldsgym';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];
    const page = await this.chromeManager.newPage();

    try {
      // Implementation here
      const locationUrl = `${this.config.baseUrl}/gyms/${options.location || 'default'}/group-fitness`;
      await this.chromeManager.navigateWithRetry(page, locationUrl);

      // Wait for schedule to load
      await page.waitForSelector('.group-class', { timeout: 10000 });

      // Extract classes
      // ... implementation ...

      return this.createScrapeResult(classes, true, errors);
    } catch (error) {
      this.logError("Gold's Gym scraping failed", error);
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
npm run scrape -- --provider=goldsgym --max-results=20
```

### Completion

When done:
1. Test scraper works and returns classes
2. Create completion marker: `touch .claude/completed/019`
3. Commit changes
4. Push to branch: `claude/task-019`

## Complete Code Required

Provide the full, working implementation of GoldsGymProvider.ts with all necessary imports and error handling.
