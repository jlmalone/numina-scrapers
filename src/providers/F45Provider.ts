import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for F45 Training
 * F45 is a functional training studio chain with daily varied 45-minute workouts
 *
 * Note: This implementation is a template based on typical fitness studio structures.
 * Actual selectors would need to be adjusted based on F45's website.
 */
export class F45Provider extends BaseProvider {
  readonly name = 'f45';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting F45 Training scrape');

    const page = await this.chromeManager.newPage();

    try {
      // Navigate to the class schedule page
      const location = options.location || this.config.defaultLocation || 'new-york';
      const scheduleUrl = `${this.config.baseUrl}/studios/${location}/timetable`;

      await this.chromeManager.navigateWithRetry(page, scheduleUrl);
      this.logProgress(`Loaded schedule page for location: ${location}`);

      // Wait for schedule container
      const scheduleSelector = '.schedule-container, .timetable, [data-schedule], .workout-schedule';

      try {
        await page.waitForSelector(scheduleSelector, { timeout: 10000 });
      } catch (error) {
        this.logError('Schedule container not found. Site structure may have changed.');
        errors.push('Schedule not found');
        return this.createScrapeResult(classes, false, errors);
      }

      // Extract all class cards/items
      const classCards = await page.$$('.class-card, .workout-card, .timetable-item, .session-card');
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
              name: getTextContent('.workout-name, .class-name, .session-name, h3, h4'),
              trainer: getTextContent('.trainer-name, .instructor, .coach, [data-trainer]'),
              time: getTextContent('.class-time, .time, .session-time'),
              date: getTextContent('.class-date, .date') || getAttribute('[data-date]', 'data-date'),
              duration: getTextContent('.duration, .class-duration'),
              description: getTextContent('.workout-description, .description, p'),
              location: getTextContent('.location, .studio-name'),
              workoutType: getTextContent('.workout-type, .category'),
              spots: getTextContent('.spots-available, .spots, .availability'),
              bookingLink: getAttribute('a.book-now, .booking-link, a', 'href')
            };
          }, classCards[i]);

          // F45 has daily named workouts (e.g., "Panthers", "Hollywood", "Athletica")
          const className = classInfo.name || classInfo.workoutType || 'F45 Training';

          // Skip if no class name
          if (!className || className === '') {
            continue;
          }

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
          const locationName = classInfo.location || `F45 ${location}`;
          const address = `F45 Training ${location}`;

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

          // F45 workouts vary between cardio, resistance, and hybrid
          // Default to high intensity
          let intensity = 8;
          let workoutTags = 'functional hiit circuit';

          if (classInfo.workoutType) {
            const type = classInfo.workoutType.toLowerCase();
            if (type.includes('cardio')) {
              intensity = 9;
              workoutTags += ' cardio';
            } else if (type.includes('resistance') || type.includes('strength')) {
              intensity = 7;
              workoutTags += ' strength resistance';
            } else if (type.includes('hybrid')) {
              intensity = 8;
              workoutTags += ' cardio strength';
            }
          }

          // Parse capacity (F45 studios typically have 25-36 stations)
          const capacity = this.parseCapacity(classInfo.spots) || 36;

          // F45 is typically membership-based
          const price = 0; // Included in membership

          // Generate description
          let description = sanitizeString(classInfo.description);
          if (!description) {
            description = '45-minute functional training workout combining cardio, resistance, and recovery exercises in a team environment.';
          }

          // Create fitness class object
          const fitnessClass: FitnessClass = {
            name: sanitizeString(className),
            description,
            datetime,
            location: locationData,
            trainer: sanitizeString(classInfo.trainer) || 'F45 Trainer',
            intensity,
            price,
            bookingUrl: this.normalizeUrl(classInfo.bookingLink) || scheduleUrl,
            providerId: `f45-${locationName}-${datetime.getTime()}-${className}`,
            providerName: this.name,
            capacity,
            tags: parseTags(workoutTags + ' ' + className + ' ' + classInfo.description)
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

      this.logProgress(`F45 Training scrape complete. Found ${classes.length} classes`);

    } catch (error) {
      const errorMsg = `F45 Training scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
      return this.createScrapeResult(classes, false, errors);

    } finally {
      await this.chromeManager.closePage(page);
    }

    return this.createScrapeResult(classes, true, errors);
  }
}
