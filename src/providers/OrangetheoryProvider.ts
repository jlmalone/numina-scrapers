import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for Orangetheory Fitness
 * Orangetheory is a heart rate-based interval training fitness studio chain
 *
 * Note: This implementation is a template based on typical fitness studio structures.
 * Actual selectors would need to be adjusted based on Orangetheory's website.
 */
export class OrangetheoryProvider extends BaseProvider {
  readonly name = 'orangetheory';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting Orangetheory Fitness scrape');

    const page = await this.chromeManager.newPage();

    try {
      // Navigate to the class schedule page
      const location = options.location || this.config.defaultLocation || 'new-york';
      const scheduleUrl = `${this.config.baseUrl}/studio/${location}/schedule`;

      await this.chromeManager.navigateWithRetry(page, scheduleUrl);
      this.logProgress(`Loaded schedule page for location: ${location}`);

      // Wait for schedule container
      const scheduleSelector = '.schedule-container, .class-list, [data-schedule], .otf-schedule';

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
              coach: getTextContent('.coach-name, .instructor, .teacher, [data-instructor]'),
              time: getTextContent('.class-time, .time, .workout-time'),
              date: getTextContent('.class-date, .date') || getAttribute('[data-date]', 'data-date'),
              duration: getTextContent('.duration, .class-duration'),
              description: getTextContent('.class-description, .description, p'),
              location: getTextContent('.location, .studio-name'),
              spots: getTextContent('.spots-available, .spots, .availability'),
              waitlist: getTextContent('.waitlist'),
              classType: getTextContent('.class-type, .workout-type'),
              bookingLink: getAttribute('a.book-now, .booking-link, a', 'href')
            };
          }, classCards[i]);

          // Orangetheory classes are typically "Orangetheory 60" or "Orangetheory 90"
          const className = classInfo.name || classInfo.classType || 'Orangetheory 60';

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
          const locationName = classInfo.location || `Orangetheory ${location}`;
          const address = `Orangetheory Fitness ${location}`;

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

          // Orangetheory is high-intensity interval training
          const intensity = 8;

          // Parse capacity (Orangetheory studios typically have ~30 stations)
          const capacity = this.parseCapacity(classInfo.spots) || 36;

          // Orangetheory is typically membership-based
          const price = 0; // Included in membership

          // Generate description
          let description = sanitizeString(classInfo.description);
          if (!description) {
            description = 'Heart rate-based interval training using treadmills, rowing machines, and strength equipment. Burn calories and boost metabolism with 5 heart rate zones.';
          }

          // Create fitness class object
          const fitnessClass: FitnessClass = {
            name: sanitizeString(className),
            description,
            datetime,
            location: locationData,
            trainer: sanitizeString(classInfo.coach) || 'Orangetheory Coach',
            intensity,
            price,
            bookingUrl: this.normalizeUrl(classInfo.bookingLink) || scheduleUrl,
            providerId: `orangetheory-${locationName}-${datetime.getTime()}-${className}`,
            providerName: this.name,
            capacity,
            tags: parseTags('hiit cardio strength rowing treadmill heart-rate ' + className + ' ' + classInfo.description)
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

      this.logProgress(`Orangetheory Fitness scrape complete. Found ${classes.length} classes`);

    } catch (error) {
      const errorMsg = `Orangetheory Fitness scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
      return this.createScrapeResult(classes, false, errors);

    } finally {
      await this.chromeManager.closePage(page);
    }

    return this.createScrapeResult(classes, true, errors);
  }
}
