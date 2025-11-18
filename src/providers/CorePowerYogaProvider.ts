import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for CorePower Yoga
 * CorePower Yoga is a yoga studio chain with multiple class types
 *
 * Note: This implementation is a template based on typical fitness website structures.
 * You'll need to inspect CorePower Yoga's actual website and adjust selectors.
 */
export class CorePowerYogaProvider extends BaseProvider {
  readonly name = 'corepoweryoga';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting CorePower Yoga scrape');

    const page = await this.chromeManager.newPage();

    try {
      // Navigate to the class schedule page
      const location = options.location || this.config.defaultLocation || 'new-york';
      const scheduleUrl = `${this.config.baseUrl}/studios/${location}/schedule`;

      await this.chromeManager.navigateWithRetry(page, scheduleUrl);
      this.logProgress(`Loaded schedule page for location: ${location}`);

      // Wait for schedule container
      const scheduleSelector = '.schedule-container, .class-list, .yoga-schedule, [data-schedule]';

      try {
        await page.waitForSelector(scheduleSelector, { timeout: 10000 });
      } catch (error) {
        this.logError('Schedule container not found. Site structure may have changed.');
        errors.push('Schedule not found');
        return this.createScrapeResult(classes, false, errors);
      }

      // Extract all class cards/items
      const classCards = await page.$$('.class-card, .yoga-class, .schedule-item, .class-item');
      this.logProgress(`Found ${classCards.length} potential classes`);

      for (let i = 0; i < classCards.length; i++) {
        try {
          const classInfo = await page.evaluate((card) => {
            const getTextContent = (selector: string): string => {
              const el = card.querySelector(selector);
              return el?.textContent?.trim() || '';
            };

            const getAttribute = (selector: string, attr: string): string => {
              const el = card.querySelector(selector);
              return el?.getAttribute(attr) || '';
            };

            return {
              name: getTextContent('.class-title, .class-name, h3, h4'),
              instructor: getTextContent('.instructor-name, .teacher, .instructor, [data-instructor]'),
              time: getTextContent('.class-time, .time, .start-time'),
              date: getTextContent('.class-date, .date') || getAttribute('[data-date]', 'data-date'),
              duration: getTextContent('.duration, .class-duration'),
              description: getTextContent('.class-description, .description, p'),
              location: getTextContent('.location, .studio, .studio-name'),
              level: getTextContent('.level, .intensity'),
              spotsAvailable: getTextContent('.spots, .availability, .spots-left'),
              bookingLink: getAttribute('a.book-now, .booking-link, a.reserve, a.book', 'href'),
              price: getTextContent('.price, .cost, [data-price]'),
              classType: getTextContent('.class-type, .yoga-type, .style')
            };
          }, classCards[i]);

          // Skip if no class name
          if (!classInfo.name) {
            continue;
          }

          // Parse datetime
          const datetime = this.parseDateTime(classInfo.date, classInfo.time);
          if (!datetime) {
            this.logError(`Could not parse datetime for class: ${classInfo.name}`);
            continue;
          }

          // Check if within date range
          if (!this.isWithinDateRange(datetime, options)) {
            continue;
          }

          // Get location details
          const locationName = classInfo.location || `CorePower Yoga ${location}`;
          const address = `CorePower Yoga ${location}`;

          // Geocode location
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
                lat: 40.7589, // Default NYC coordinates (placeholder)
                long: -73.9851
              };

          // Determine intensity based on class type
          let intensity = 5;
          const className = classInfo.name.toLowerCase();
          const classType = classInfo.classType.toLowerCase();
          if (className.includes('sculpt') || className.includes('power') || classType.includes('c2')) {
            intensity = 7; // Power yoga is more intense
          } else if (className.includes('restore') || className.includes('gentle') || classType.includes('c1')) {
            intensity = 3; // Gentle/restorative yoga
          } else if (classInfo.level) {
            intensity = parseIntensity(classInfo.level);
          }

          // Parse capacity (typical yoga class size)
          const capacity = this.parseCapacity(classInfo.spotsAvailable) || 30;

          // Parse price (CorePower uses membership/drop-in)
          const price = classInfo.price ? this.parsePrice(classInfo.price) : 25;

          // Create fitness class object
          const fitnessClass: FitnessClass = {
            name: sanitizeString(classInfo.name),
            description: sanitizeString(classInfo.description) || 'Yoga class',
            datetime,
            location: locationData,
            trainer: sanitizeString(classInfo.instructor) || 'Instructor',
            intensity,
            price,
            bookingUrl: this.normalizeUrl(classInfo.bookingLink) || scheduleUrl,
            providerId: `corepoweryoga-${datetime.getTime()}-${classInfo.name}-${locationName}`,
            providerName: this.name,
            capacity,
            tags: parseTags('yoga stretching core ' + classInfo.name + ' ' + classInfo.description + ' ' + classInfo.classType)
          };

          // Validate and add
          if (this.validateClass(fitnessClass)) {
            classes.push(fitnessClass);
            this.logProgress(`Scraped: ${fitnessClass.name} on ${datetime.toLocaleString()}`);
          } else {
            this.logError(`Invalid class data for: ${classInfo.name}`);
          }

          // Respect rate limits
          await this.respectRateLimit();

          // Check max results
          if (options.maxResults && classes.length >= options.maxResults) {
            break;
          }

        } catch (error) {
          const errorMsg = `Error processing class card ${i}: ${error}`;
          this.logError(errorMsg);
          errors.push(errorMsg);
        }
      }

      this.logProgress(`CorePower Yoga scrape complete. Found ${classes.length} classes`);

    } catch (error) {
      const errorMsg = `CorePower Yoga scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
      return this.createScrapeResult(classes, false, errors);

    } finally {
      await this.chromeManager.closePage(page);
    }

    return this.createScrapeResult(classes, true, errors);
  }
}
