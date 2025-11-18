import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for Barry's Bootcamp
 * High-intensity interval training fitness studio chain
 * Known for "Red Room" workouts combining treadmill and strength training
 *
 * Note: Barry's uses location-based scheduling and may require session handling
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
      // Navigate to Barry's schedule page
      const location = options.location || this.config.defaultLocation || 'new-york';
      const scheduleUrl = `${this.config.baseUrl}/locations/${location}/schedule`;

      await this.chromeManager.navigateWithRetry(page, scheduleUrl);
      this.logProgress(`Loaded Barry's schedule for: ${location}`);

      // Wait for schedule grid
      const scheduleSelector = '.schedule-grid, .class-schedule, [data-classes]';

      try {
        await page.waitForSelector(scheduleSelector, { timeout: 15000 });
      } catch (error) {
        this.logError('Schedule not found. May need to adjust selectors or handle authentication.');
        errors.push('Schedule grid not found');
        return this.createScrapeResult(classes, false, errors);
      }

      // Extract class elements
      const classElements = await page.$$('.class-slot, .workout-card, .schedule-item');
      this.logProgress(`Found ${classElements.length} Barry's classes`);

      for (let i = 0; i < classElements.length; i++) {
        try {
          const classData = await page.evaluate((el) => {
            const getText = (selector: string): string => {
              return el.querySelector(selector)?.textContent?.trim() || '';
            };

            const getAttr = (selector: string, attr: string): string => {
              return el.querySelector(selector)?.getAttribute(attr) || '';
            };

            return {
              workoutType: getText('.workout-type, .class-name, h3'),
              instructor: getText('.instructor-name, .coach-name'),
              time: getText('.time, .class-time') || getAttr('[data-time]', 'data-time'),
              date: getText('.date, .day') || getAttr('[data-date]', 'data-date'),
              duration: getText('.duration') || '50 minutes', // Barry's standard class length
              description: getText('.description, .workout-description'),
              studioName: getText('.studio, .location-name'),
              price: getText('.price, .cost'),
              availability: getText('.spots-left, .availability'),
              focus: getText('.focus, .workout-focus'), // e.g., "Arms & Abs"
              bookingUrl: getAttr('a.book, .booking-button', 'href')
            };
          }, classElements[i]);

          // Skip if no workout type
          if (!classData.workoutType) {
            continue;
          }

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

          // Get studio location
          const studioName = classData.studioName || `Barry's Bootcamp ${location}`;
          const address = studioName;

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
                lat: 40.7589, // Default NYC
                long: -73.9851
              };

          // Parse price (Barry's typically uses packages/credits)
          const price = this.parsePrice(classData.price) || 38.00; // Typical drop-in rate

          // Barry's is very high intensity HIIT
          const intensity = 9;

          // Standard Barry's class capacity
          const capacity = this.parseCapacity(classData.availability) || 40;

          // Build class name with focus if available
          const className = classData.focus
            ? `${classData.workoutType} - ${classData.focus}`
            : classData.workoutType;

          // Build description
          const description = classData.description ||
            `High-intensity interval training combining treadmill cardio and strength training in the Red Room.`;

          // Create fitness class
          const fitnessClass: FitnessClass = {
            name: sanitizeString(className),
            description: sanitizeString(description),
            datetime,
            location: locationData,
            trainer: sanitizeString(classData.instructor) || 'Barry\'s Coach',
            intensity,
            price,
            bookingUrl: this.normalizeUrl(classData.bookingUrl) || scheduleUrl,
            providerId: `barrys-${studioName}-${datetime.getTime()}-${classData.workoutType}`,
            providerName: this.name,
            capacity,
            tags: ['hiit', 'bootcamp', 'treadmill', 'strength', 'cardio', 'high-intensity']
          };

          // Validate and add
          if (this.validateClass(fitnessClass)) {
            classes.push(fitnessClass);
            this.logProgress(`Scraped: ${fitnessClass.name} at ${studioName}`);
          } else {
            this.logError(`Invalid class: ${classData.workoutType}`);
          }

          // Respect rate limits
          await this.respectRateLimit();

          // Check max results
          if (options.maxResults && classes.length >= options.maxResults) {
            break;
          }

        } catch (error) {
          const errorMsg = `Error processing Barry's class ${i}: ${error}`;
          this.logError(errorMsg);
          errors.push(errorMsg);
        }
      }

      this.logProgress(`Barry's scrape complete. Found ${classes.length} classes`);

    } catch (error) {
      const errorMsg = `Barry's scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
      return this.createScrapeResult(classes, false, errors);

    } finally {
      await this.chromeManager.closePage(page);
    }

    return this.createScrapeResult(classes, true, errors);
  }
}
