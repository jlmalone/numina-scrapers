import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for SoulCycle
 * Premium indoor cycling studio chain with rhythm-based classes
 *
 * Note: SoulCycle has location-specific schedules. Implementation may need
 * to handle authentication or session cookies for full schedule access.
 */
export class SoulCycleProvider extends BaseProvider {
  readonly name = 'soulcycle';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting SoulCycle scrape');

    const page = await this.chromeManager.newPage();

    try {
      // Navigate to SoulCycle schedule page
      const location = options.location || this.config.defaultLocation || 'new-york-ny';
      const scheduleUrl = `${this.config.baseUrl}/studios/${location}/schedule`;

      await this.chromeManager.navigateWithRetry(page, scheduleUrl);
      this.logProgress(`Loaded SoulCycle schedule for: ${location}`);

      // Wait for schedule to load
      const scheduleSelector = '.class-list, .schedule-grid, [data-schedule-container]';

      try {
        await page.waitForSelector(scheduleSelector, { timeout: 15000 });
      } catch (error) {
        this.logError('Schedule not found. Site structure may have changed or location invalid.');
        errors.push('Schedule container not found');
        return this.createScrapeResult(classes, false, errors);
      }

      // Extract class cards
      const classCards = await page.$$('.class-card, .ride-card, .schedule-item');
      this.logProgress(`Found ${classCards.length} SoulCycle classes`);

      for (let i = 0; i < classCards.length; i++) {
        try {
          const classInfo = await page.evaluate((card) => {
            const getText = (selector: string): string => {
              return card.querySelector(selector)?.textContent?.trim() || '';
            };

            const getAttr = (selector: string, attr: string): string => {
              return card.querySelector(selector)?.getAttribute(attr) || '';
            };

            return {
              name: getText('.class-name, .ride-name, h3'),
              instructor: getText('.instructor-name, .teacher'),
              time: getText('.class-time, .time') || getAttr('[data-time]', 'data-time'),
              date: getText('.class-date, .date') || getAttr('[data-date]', 'data-date'),
              duration: getText('.duration, .class-length'),
              description: getText('.class-description, .description'),
              studioName: getText('.studio-name, .location'),
              price: getText('.price, .cost, .credits'),
              spotsLeft: getText('.spots-available, .availability'),
              bookingUrl: getAttr('a.book-btn, .booking-link', 'href'),
              bikeType: getText('.bike-type, .equipment')
            };
          }, classCards[i]);

          // Skip if no class name
          if (!classInfo.name) {
            continue;
          }

          // Parse datetime
          const datetime = this.parseDateTime(classInfo.date, classInfo.time);
          if (!datetime) {
            this.logError(`Could not parse datetime: ${classInfo.date} ${classInfo.time}`);
            continue;
          }

          // Check date range
          if (!this.isWithinDateRange(datetime, options)) {
            continue;
          }

          // Get studio location
          const studioName = classInfo.studioName || `SoulCycle ${location}`;
          const address = `SoulCycle ${location}`; // In production, maintain a studio location database

          // Geocode location
          const geocoded = await geocodeAddress(address);
          const locationData = geocoded
            ? {
                name: studioName,
                address: geocoded.formattedAddress,
                lat: geocoded.lat,
                long: geocoded.long
              }
            : {
                name: studioName,
                address: address,
                lat: 40.7589, // Default NYC coordinates
                long: -73.9851
              };

          // Parse price (SoulCycle typically uses credits or package pricing)
          const price = this.parsePrice(classInfo.price) || 34.00; // Typical drop-in rate

          // SoulCycle is high intensity cycling
          const intensity = 8; // High intensity cycling

          // Parse capacity from spots available
          const capacity = this.parseCapacity(classInfo.spotsLeft) || 60; // Typical SoulCycle capacity

          // Create fitness class
          const fitnessClass: FitnessClass = {
            name: sanitizeString(classInfo.name),
            description: sanitizeString(classInfo.description || 'Indoor cycling class with rhythm-based choreography'),
            datetime,
            location: locationData,
            trainer: sanitizeString(classInfo.instructor) || 'SoulCycle Instructor',
            intensity,
            price,
            bookingUrl: this.normalizeUrl(classInfo.bookingUrl) || scheduleUrl,
            providerId: `soulcycle-${studioName}-${datetime.getTime()}-${classInfo.name}`,
            providerName: this.name,
            capacity,
            tags: ['cycling', 'spin', 'cardio', 'music', 'high-intensity']
          };

          // Validate and add
          if (this.validateClass(fitnessClass)) {
            classes.push(fitnessClass);
            this.logProgress(`Scraped: ${fitnessClass.name} with ${classInfo.instructor}`);
          } else {
            this.logError(`Invalid class: ${classInfo.name}`);
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

      this.logProgress(`SoulCycle scrape complete. Found ${classes.length} classes`);

    } catch (error) {
      const errorMsg = `SoulCycle scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
      return this.createScrapeResult(classes, false, errors);

    } finally {
      await this.chromeManager.closePage(page);
    }

    return this.createScrapeResult(classes, true, errors);
  }
}
