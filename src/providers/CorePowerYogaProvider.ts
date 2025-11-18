import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for CorePower Yoga
 * Large yoga studio chain with various yoga class styles
 * Offers classes from gentle yoga to heated power yoga
 *
 * Note: CorePower has studio-specific schedules and multiple class formats
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
      // Navigate to CorePower schedule
      const location = options.location || this.config.defaultLocation || 'new-york';
      const scheduleUrl = `${this.config.baseUrl}/studios/${location}/schedule`;

      await this.chromeManager.navigateWithRetry(page, scheduleUrl);
      this.logProgress(`Loaded CorePower schedule for: ${location}`);

      // Wait for schedule
      const scheduleSelector = '.schedule-table, .class-schedule, [data-classes]';

      try {
        await page.waitForSelector(scheduleSelector, { timeout: 15000 });
      } catch (error) {
        this.logError('Schedule not found. May need different selectors.');
        errors.push('Schedule table not found');
        return this.createScrapeResult(classes, false, errors);
      }

      // Extract class listings
      const classItems = await page.$$('.class-item, .yoga-class, .schedule-row');
      this.logProgress(`Found ${classItems.length} CorePower classes`);

      for (let i = 0; i < classItems.length; i++) {
        try {
          const classInfo = await page.evaluate((item) => {
            const getText = (selector: string): string => {
              return item.querySelector(selector)?.textContent?.trim() || '';
            };

            const getAttr = (selector: string, attr: string): string => {
              return item.querySelector(selector)?.getAttribute(attr) || '';
            };

            return {
              className: getText('.class-name, .class-type, h3'),
              instructor: getText('.instructor-name, .teacher'),
              time: getText('.time, .class-time') || getAttr('[data-time]', 'data-time'),
              date: getText('.date, .day') || getAttr('[data-date]', 'data-date'),
              duration: getText('.duration, .length'),
              description: getText('.description, .class-description'),
              studioName: getText('.studio, .location-name'),
              level: getText('.level, .difficulty'), // e.g., "C1", "C2", "Hot Power Fusion"
              price: getText('.price, .cost'),
              spotsLeft: getText('.spots, .availability'),
              temperature: getText('.temp, .heated'), // Some classes are heated
              bookingUrl: getAttr('a.book, .signup-link', 'href')
            };
          }, classItems[i]);

          // Skip if no class name
          if (!classInfo.className) {
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
          const studioName = classInfo.studioName || `CorePower Yoga ${location}`;
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

          // Parse price (CorePower uses memberships and drop-in rates)
          const price = this.parsePrice(classInfo.price) || 25.00; // Typical drop-in rate

          // Determine intensity based on class type
          let intensity = 5; // Default moderate
          const classTypeLower = classInfo.className.toLowerCase();
          const levelLower = classInfo.level.toLowerCase();

          if (classTypeLower.includes('power') || levelLower.includes('c2') || classTypeLower.includes('sculpt')) {
            intensity = 7;
          } else if (classTypeLower.includes('hot') || classTypeLower.includes('fusion')) {
            intensity = 8;
          } else if (classTypeLower.includes('c1') || classTypeLower.includes('beginner')) {
            intensity = 4;
          } else if (classTypeLower.includes('gentle') || classTypeLower.includes('restorative')) {
            intensity = 2;
          }

          // Parse capacity
          const capacity = this.parseCapacity(classInfo.spotsLeft) || 45;

          // Build description
          let description = classInfo.description ||
            `${classInfo.className} yoga class at CorePower Yoga.`;

          if (classInfo.temperature && classInfo.temperature.toLowerCase().includes('heat')) {
            description += ' Heated room.';
          }

          // Determine tags
          const tags = ['yoga'];
          if (classTypeLower.includes('power')) tags.push('power-yoga');
          if (classTypeLower.includes('hot') || classInfo.temperature?.toLowerCase().includes('heat')) {
            tags.push('hot-yoga');
          }
          if (classTypeLower.includes('sculpt')) {
            tags.push('yoga-sculpt', 'strength');
          }
          if (classTypeLower.includes('flow')) tags.push('vinyasa');
          if (classTypeLower.includes('restore')) tags.push('restorative');

          // Create fitness class
          const fitnessClass: FitnessClass = {
            name: sanitizeString(classInfo.className),
            description: sanitizeString(description),
            datetime,
            location: locationData,
            trainer: sanitizeString(classInfo.instructor) || 'CorePower Instructor',
            intensity,
            price,
            bookingUrl: this.normalizeUrl(classInfo.bookingUrl) || scheduleUrl,
            providerId: `corepoweryoga-${studioName}-${datetime.getTime()}-${classInfo.className}`,
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
          const errorMsg = `Error processing CorePower class ${i}: ${error}`;
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
