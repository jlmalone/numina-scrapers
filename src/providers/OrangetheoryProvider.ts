import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for Orangetheory Fitness
 * Heart rate-based interval training fitness studio
 * Known for science-backed workouts using heart rate monitoring
 *
 * Note: Orangetheory uses franchise model with location-specific schedules
 */
export class OrangetheoryProvider extends BaseProvider {
  readonly name = 'orangetheory';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting Orangetheory scrape');

    const page = await this.chromeManager.newPage();

    try {
      // Navigate to Orangetheory schedule
      const location = options.location || this.config.defaultLocation || 'new-york';
      const scheduleUrl = `${this.config.baseUrl}/studio/${location}/schedule`;

      await this.chromeManager.navigateWithRetry(page, scheduleUrl);
      this.logProgress(`Loaded Orangetheory schedule for: ${location}`);

      // Wait for schedule container
      const scheduleSelector = '.schedule-container, .class-schedule, [data-schedule]';

      try {
        await page.waitForSelector(scheduleSelector, { timeout: 15000 });
      } catch (error) {
        this.logError('Schedule not found. Selectors may need adjustment.');
        errors.push('Schedule container not found');
        return this.createScrapeResult(classes, false, errors);
      }

      // Extract class cards
      const classCards = await page.$$('.class-card, .workout-card, .session-card');
      this.logProgress(`Found ${classCards.length} Orangetheory classes`);

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
              className: getText('.class-name, .workout-type') || 'Orangetheory Workout',
              coach: getText('.coach-name, .instructor, .staff'),
              time: getText('.time, .class-time') || getAttr('[data-time]', 'data-time'),
              date: getText('.date, .day') || getAttr('[data-date]', 'data-date'),
              duration: getText('.duration') || '60 minutes',
              description: getText('.description, .class-description'),
              studioName: getText('.studio-name, .location'),
              price: getText('.price, .cost, .credits'),
              spotsAvailable: getText('.spots, .availability, .waitlist'),
              workoutFocus: getText('.focus, .template'), // e.g., "Endurance", "Power", "ESP"
              bookingUrl: getAttr('a.book, .sign-up-btn', 'href')
            };
          }, classCards[i]);

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
          const studioName = classInfo.studioName || `Orangetheory ${location}`;
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
                lat: 40.7589,
                long: -73.9851
              };

          // Parse price (Orangetheory uses membership packages)
          const price = this.parsePrice(classInfo.price) || 28.00; // Typical package rate

          // Orangetheory is high intensity
          const intensity = 8; // Heart rate-based HIIT

          // Standard OTF class size
          const capacity = this.parseCapacity(classInfo.spotsAvailable) || 36;

          // Build class name with workout focus if available
          const className = classInfo.workoutFocus
            ? `Orangetheory ${classInfo.workoutFocus}`
            : classInfo.className;

          // Build description
          const description = classInfo.description ||
            `Heart rate-based interval training workout combining treadmill, rowing, and strength training.`;

          // Determine tags based on workout focus
          const tags = ['hiit', 'heart-rate', 'interval', 'rowing', 'treadmill', 'strength'];
          if (classInfo.workoutFocus?.toLowerCase().includes('endurance')) {
            tags.push('endurance');
          }
          if (classInfo.workoutFocus?.toLowerCase().includes('power')) {
            tags.push('power');
          }

          // Create fitness class
          const fitnessClass: FitnessClass = {
            name: sanitizeString(className),
            description: sanitizeString(description),
            datetime,
            location: locationData,
            trainer: sanitizeString(classInfo.coach) || 'OTF Coach',
            intensity,
            price,
            bookingUrl: this.normalizeUrl(classInfo.bookingUrl) || scheduleUrl,
            providerId: `orangetheory-${studioName}-${datetime.getTime()}-${classInfo.className}`,
            providerName: this.name,
            capacity,
            tags
          };

          // Validate and add
          if (this.validateClass(fitnessClass)) {
            classes.push(fitnessClass);
            this.logProgress(`Scraped: ${fitnessClass.name} at ${studioName}`);
          } else {
            this.logError(`Invalid class: ${classInfo.className}`);
          }

          // Respect rate limits
          await this.respectRateLimit();

          // Check max results
          if (options.maxResults && classes.length >= options.maxResults) {
            break;
          }

        } catch (error) {
          const errorMsg = `Error processing Orangetheory class ${i}: ${error}`;
          this.logError(errorMsg);
          errors.push(errorMsg);
        }
      }

      this.logProgress(`Orangetheory scrape complete. Found ${classes.length} classes`);

    } catch (error) {
      const errorMsg = `Orangetheory scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
      return this.createScrapeResult(classes, false, errors);

    } finally {
      await this.chromeManager.closePage(page);
    }

    return this.createScrapeResult(classes, true, errors);
  }
}
