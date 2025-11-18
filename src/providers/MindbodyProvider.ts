import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for Mindbody-powered websites
 * Mindbody is a major booking platform used by gyms and studios worldwide
 *
 * Note: This implementation is a template. Actual Mindbody sites may vary in structure.
 * You'll need to inspect the specific site's HTML structure and adjust selectors accordingly.
 */
export class MindbodyProvider extends BaseProvider {
  readonly name = 'mindbody';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting scrape');

    const page = await this.chromeManager.newPage();

    try {
      // Navigate to the schedule page
      const scheduleUrl = `${this.config.baseUrl}/schedule`;
      await this.chromeManager.navigateWithRetry(page, scheduleUrl);

      this.logProgress('Loaded schedule page');

      // Wait for the schedule to load
      // Common Mindbody selectors (may vary by site)
      const classSelector = '.class-item, .schedule-item, [data-class-id]';

      try {
        await page.waitForSelector(classSelector, { timeout: 10000 });
      } catch (error) {
        this.logError('Schedule not found on page. Selectors may need adjustment.');
        errors.push('Schedule container not found');
        return this.createScrapeResult(classes, false, errors);
      }

      // Extract class elements
      const classElements = await page.$$(classSelector);
      this.logProgress(`Found ${classElements.length} class elements`);

      for (let i = 0; i < classElements.length; i++) {
        try {
          // Extract class data from each element
          const classData = await page.evaluate((el) => {
            // This is a template - actual selectors will vary by site
            const nameEl = el.querySelector('.class-name, .title, h3');
            const timeEl = el.querySelector('.class-time, .time, [data-time]');
            const dateEl = el.querySelector('.class-date, .date, [data-date]');
            const trainerEl = el.querySelector('.instructor, .trainer, .staff-name');
            const descEl = el.querySelector('.description, .class-description');
            const priceEl = el.querySelector('.price, .cost');
            const locationEl = el.querySelector('.location, .studio-name');
            const capacityEl = el.querySelector('.capacity, .spots');
            const linkEl = el.querySelector('a[href*="book"], a[href*="class"]');

            return {
              name: nameEl?.textContent?.trim() || '',
              time: timeEl?.textContent?.trim() || '',
              date: dateEl?.textContent?.trim() || '',
              trainer: trainerEl?.textContent?.trim() || 'Unknown',
              description: descEl?.textContent?.trim() || '',
              price: priceEl?.textContent?.trim() || '0',
              locationName: locationEl?.textContent?.trim() || '',
              capacity: capacityEl?.textContent?.trim() || '0',
              bookingUrl: linkEl?.getAttribute('href') || ''
            };
          }, classElements[i]);

          // Parse datetime
          const datetime = this.parseDateTime(classData.date, classData.time);
          if (!datetime) {
            this.logError(`Could not parse datetime: ${classData.date} ${classData.time}`);
            continue;
          }

          // Check date range
          if (!this.isWithinDateRange(datetime, options)) {
            continue;
          }

          // Parse location - use default if not found
          const locationName = classData.locationName || this.config.defaultLocation || 'Unknown Location';
          const locationAddress = this.config.defaultLocation || locationName;

          // Geocode address (with caching in production)
          const geocoded = await geocodeAddress(locationAddress);
          const location = geocoded
            ? {
                name: locationName,
                address: geocoded.formattedAddress,
                lat: geocoded.lat,
                long: geocoded.long
              }
            : {
                name: locationName,
                address: locationAddress,
                lat: 0,
                long: 0
              };

          // Create FitnessClass object
          const fitnessClass: FitnessClass = {
            name: sanitizeString(classData.name),
            description: sanitizeString(classData.description),
            datetime,
            location,
            trainer: sanitizeString(classData.trainer),
            intensity: parseIntensity(classData.description || classData.name),
            price: this.parsePrice(classData.price),
            bookingUrl: this.normalizeUrl(classData.bookingUrl),
            providerId: `mindbody-${datetime.getTime()}-${classData.name}`,
            providerName: this.name,
            capacity: this.parseCapacity(classData.capacity),
            tags: parseTags(classData.name + ' ' + classData.description)
          };

          // Validate and add
          if (this.validateClass(fitnessClass)) {
            classes.push(fitnessClass);
            this.logProgress(`Scraped class: ${fitnessClass.name} at ${datetime.toISOString()}`);
          }

          // Respect rate limits
          await this.respectRateLimit();

          // Check max results
          if (options.maxResults && classes.length >= options.maxResults) {
            break;
          }

        } catch (error) {
          const errorMsg = `Error processing class ${i}: ${error}`;
          this.logError(errorMsg);
          errors.push(errorMsg);
        }
      }

      this.logProgress(`Scraping complete. Found ${classes.length} classes`);

    } catch (error) {
      const errorMsg = `Scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
      return this.createScrapeResult(classes, false, errors);

    } finally {
      await this.chromeManager.closePage(page);
    }

    return this.createScrapeResult(classes, true, errors);
  }
}
