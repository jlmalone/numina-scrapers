import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for ClassPass
 * ClassPass is a subscription service for fitness classes across multiple studios
 *
 * Note: ClassPass may require authentication and has rate limiting.
 * This implementation shows the structure - actual implementation may need to handle auth.
 */
export class ClassPassProvider extends BaseProvider {
  readonly name = 'classpass';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting ClassPass scrape');

    const page = await this.chromeManager.newPage();

    try {
      // Navigate to ClassPass search/browse page
      const location = options.location || this.config.defaultLocation || 'new-york-ny';
      const searchUrl = `${this.config.baseUrl}/classes/${location}`;

      await this.chromeManager.navigateWithRetry(page, searchUrl);
      this.logProgress(`Loaded ClassPass page for: ${location}`);

      // Wait for class listings to load
      const classListSelector = '.class-listing, .search-results, [data-class-list]';

      try {
        await page.waitForSelector(classListSelector, { timeout: 15000 });
      } catch (error) {
        this.logError('ClassPass listings not found. May require authentication or site changed.');
        errors.push('Class listings not found');
        return this.createScrapeResult(classes, false, errors);
      }

      // Scroll to load more results (ClassPass uses lazy loading)
      await this.autoScroll(page);

      // Extract class items
      const classItems = await page.$$('.class-item, .search-result-item, [data-class-id]');
      this.logProgress(`Found ${classItems.length} ClassPass classes`);

      for (let i = 0; i < classItems.length; i++) {
        try {
          const classData = await page.evaluate((item) => {
            const getText = (selector: string): string => {
              return item.querySelector(selector)?.textContent?.trim() || '';
            };

            const getAttr = (selector: string, attr: string): string => {
              return item.querySelector(selector)?.getAttribute(attr) || '';
            };

            return {
              className: getText('.class-name, h3, .title'),
              studioName: getText('.studio-name, .venue-name'),
              instructor: getText('.instructor, .teacher-name'),
              datetime: getText('.class-time, .datetime') || getAttr('[data-time]', 'data-time'),
              duration: getText('.duration'),
              description: getText('.class-description, .description'),
              category: getText('.category, .class-type'),
              credits: getText('.credits, .price'),
              spotsLeft: getText('.spots-left, .availability'),
              address: getText('.address, .location-address'),
              bookingUrl: getAttr('a.book-button, .booking-link', 'href'),
              difficulty: getText('.difficulty, .level')
            };
          }, classItems[i]);

          // Skip if no class name
          if (!classData.className) {
            continue;
          }

          // Parse datetime
          const datetime = this.parseDateTime(classData.datetime);
          if (!datetime) {
            this.logError(`Could not parse datetime: ${classData.datetime}`);
            continue;
          }

          // Check date range
          if (!this.isWithinDateRange(datetime, options)) {
            continue;
          }

          // Parse location
          const locationName = classData.studioName || 'Studio';
          const address = classData.address || locationName;

          // Geocode address
          const geocoded = await geocodeAddress(address);
          const locationData = geocoded
            ? {
                name: locationName,
                address: geocoded.formattedAddress,
                lat: geocoded.lat,
                long: geocoded.long
              }
            : {
                name: locationName,
                address: address,
                lat: 0,
                long: 0
              };

          // Parse intensity
          const intensity = classData.difficulty
            ? parseIntensity(classData.difficulty)
            : parseIntensity(classData.description || classData.className);

          // Parse price (ClassPass uses credits)
          const credits = parseInt(classData.credits.replace(/\D/g, '')) || 0;
          const price = credits * 0.33; // Rough conversion: 1 credit ≈ $0.33

          // Parse capacity
          const capacity = this.parseCapacity(classData.spotsLeft) || 20;

          // Create fitness class
          const fitnessClass: FitnessClass = {
            name: sanitizeString(classData.className),
            description: sanitizeString(classData.description),
            datetime,
            location: locationData,
            trainer: sanitizeString(classData.instructor) || 'Instructor',
            intensity,
            price,
            bookingUrl: this.normalizeUrl(classData.bookingUrl) || searchUrl,
            providerId: `classpass-${datetime.getTime()}-${classData.className}-${locationName}`,
            providerName: this.name,
            capacity,
            tags: parseTags(
              `${classData.className} ${classData.category} ${classData.description}`
            )
          };

          // Validate and add
          if (this.validateClass(fitnessClass)) {
            classes.push(fitnessClass);
            this.logProgress(`Scraped: ${fitnessClass.name} at ${locationName}`);
          } else {
            this.logError(`Invalid class: ${classData.className}`);
          }

          // Respect rate limits
          await this.respectRateLimit();

          // Check max results
          if (options.maxResults && classes.length >= options.maxResults) {
            break;
          }

        } catch (error) {
          const errorMsg = `Error processing ClassPass item ${i}: ${error}`;
          this.logError(errorMsg);
          errors.push(errorMsg);
        }
      }

      this.logProgress(`ClassPass scrape complete. Found ${classes.length} classes`);

    } catch (error) {
      const errorMsg = `ClassPass scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
      return this.createScrapeResult(classes, false, errors);

    } finally {
      await this.chromeManager.closePage(page);
    }

    return this.createScrapeResult(classes, true, errors);
  }

  /**
   * Auto-scroll to load lazy-loaded content
   */
  private async autoScroll(page: any): Promise<void> {
    try {
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });

      this.logProgress('Finished auto-scrolling to load content');
      await this.delay(2000); // Wait for content to load
    } catch (error) {
      this.logError('Error during auto-scroll', error);
    }
  }
}
