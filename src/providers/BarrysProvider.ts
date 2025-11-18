import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for Barry's Bootcamp
 * Barry's is a high-intensity interval training studio chain
 *
 * Note: This implementation is a template based on typical fitness studio structures.
 * Actual selectors would need to be adjusted based on Barry's website.
 */
export class BarrysProvider extends BaseProvider {
  readonly name = 'barrys';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting Barry\'s Bootcamp scrape');

    const page = await this.chromeManager.newPage();

    try {
      // Navigate to the class schedule page
      const location = options.location || this.config.defaultLocation || 'new-york';
      const scheduleUrl = `${this.config.baseUrl}/locations/${location}/schedule`;

      await this.chromeManager.navigateWithRetry(page, scheduleUrl);
      this.logProgress(`Loaded schedule page for location: ${location}`);

      // Wait for schedule container
      const scheduleSelector = '.schedule-container, .class-list, [data-schedule], .workout-schedule';

      try {
        await page.waitForSelector(scheduleSelector, { timeout: 10000 });
      } catch (error) {
        this.logError('Schedule container not found. Site structure may have changed.');
        errors.push('Schedule not found');
        return this.createScrapeResult(classes, false, errors);
      }

      // Extract all class cards/items
      const classCards = await page.$$('.class-card, .workout-card, .schedule-item, .class-listing');
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
              name: getTextContent('.class-title, .workout-name, .class-name, h3, h4'),
              instructor: getTextContent('.instructor-name, .instructor, .teacher, [data-instructor]'),
              time: getTextContent('.class-time, .time, .workout-time'),
              date: getTextContent('.class-date, .date') || getAttribute('[data-date]', 'data-date'),
              duration: getTextContent('.duration, .class-duration'),
              description: getTextContent('.class-description, .description, p'),
              location: getTextContent('.location, .studio-name'),
              spots: getTextContent('.spots-available, .spots, .availability'),
              price: getTextContent('.price, .class-price'),
              classType: getTextContent('.class-type, .workout-type'),
              bookingLink: getAttribute('a.book-now, .booking-link, a', 'href')
            };
          }, classCards[i]);

          // Barry's typically has named workouts (e.g., "Full Body", "Arms & Abs")
          const className = classInfo.name || classInfo.classType || 'Barry\'s Bootcamp';

          // Parse datetime
          const datetime = this.parseDateTime(classInfo.date, classInfo.time);
          if (!datetime) {
            this.logError(`Could not parse datetime for class: ${className}`);
            continue;
          }

          // Check if within date range
          if (!this.isWithinDateRange(datetime, options)) {
            continue;
          }

          // Get location details
          const locationName = classInfo.location || `Barry's ${location}`;
          const address = `Barry's Bootcamp ${location}`;

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

          // Barry's is high-intensity HIIT training
          const intensity = 9; // Very high intensity

          // Parse capacity
          const capacity = this.parseCapacity(classInfo.spots) || 30;

          // Parse price (Barry's typically has per-class pricing)
          const price = classInfo.price ? this.parsePrice(classInfo.price) : 38.0;

          // Generate description
          let description = sanitizeString(classInfo.description);
          if (!description) {
            description = 'High-intensity interval training combining treadmill running and strength training for a full-body workout';
          }

          // Create fitness class object
          const fitnessClass: FitnessClass = {
            name: sanitizeString(className),
            description,
            datetime,
            location: locationData,
            trainer: sanitizeString(classInfo.instructor) || 'Barry\'s Instructor',
            intensity,
            price,
            bookingUrl: this.normalizeUrl(classInfo.bookingLink) || scheduleUrl,
            providerId: `barrys-${locationName}-${datetime.getTime()}-${className}`,
            providerName: this.name,
            capacity,
            tags: parseTags('hiit bootcamp strength cardio treadmill ' + className + ' ' + classInfo.description)
          };

          // Validate and add
          if (this.validateClass(fitnessClass)) {
            classes.push(fitnessClass);
            this.logProgress(`Scraped: ${fitnessClass.name} on ${datetime.toLocaleString()}`);
          } else {
            this.logError(`Invalid class data for: ${className}`);
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

      this.logProgress(`Barry's Bootcamp scrape complete. Found ${classes.length} classes`);

    } catch (error) {
      const errorMsg = `Barry's Bootcamp scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
      return this.createScrapeResult(classes, false, errors);

    } finally {
      await this.chromeManager.closePage(page);
    }

    return this.createScrapeResult(classes, true, errors);
  }
}
