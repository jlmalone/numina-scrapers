import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for LA Fitness
 * National full-service gym chain with comprehensive group fitness programs
 * Offers a wide variety of classes from yoga to high-intensity training
 *
 * Note: LA Fitness has location-specific schedules with diverse class offerings
 */
export class LAFitnessProvider extends BaseProvider {
  readonly name = 'lafitness';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting LA Fitness scrape');

    const page = await this.chromeManager.newPage();

    try {
      // Navigate to LA Fitness schedule
      const location = options.location || this.config.defaultLocation || 'new-york';
      const scheduleUrl = `${this.config.baseUrl}/clubs/${location}/group-fitness`;

      await this.chromeManager.navigateWithRetry(page, scheduleUrl);
      this.logProgress(`Loaded LA Fitness schedule for: ${location}`);

      // Wait for schedule
      const scheduleSelector = '.group-fitness-schedule, .class-schedule, [data-schedule]';

      try {
        await page.waitForSelector(scheduleSelector, { timeout: 15000 });
      } catch (error) {
        this.logError('Group fitness schedule not found.');
        errors.push('Schedule not found');
        return this.createScrapeResult(classes, false, errors);
      }

      // Extract class listings
      const classListings = await page.$$('.class-listing, .fitness-class, .schedule-item');
      this.logProgress(`Found ${classListings.length} LA Fitness classes`);

      for (let i = 0; i < classListings.length; i++) {
        try {
          const classInfo = await page.evaluate((listing) => {
            const getText = (selector: string): string => {
              return listing.querySelector(selector)?.textContent?.trim() || '';
            };

            const getAttr = (selector: string, attr: string): string => {
              return listing.querySelector(selector)?.getAttribute(attr) || '';
            };

            return {
              className: getText('.class-name, .title, h3'),
              instructor: getText('.instructor-name, .teacher, .staff'),
              time: getText('.time, .class-time') || getAttr('[data-time]', 'data-time'),
              date: getText('.date, .day') || getAttr('[data-date]', 'data-date'),
              duration: getText('.duration, .length'),
              description: getText('.description, .class-description'),
              clubName: getText('.club-name, .location'),
              category: getText('.category, .class-type'), // e.g., "Mind & Body", "Cardio", "Strength"
              level: getText('.level, .difficulty'),
              room: getText('.room, .studio'),
              bookingRequired: getText('.booking, .signup')
            };
          }, classListings[i]);

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

          // Get club location
          const clubName = classInfo.clubName || `LA Fitness ${location}`;
          const address = clubName;

          // Geocode location
          const geocoded = await geocodeAddress(address);
          const locationData = geocoded
            ? {
                name: clubName,
                address: geocoded.formattedAddress,
                lat: geocoded.lat,
                long: geocoded.long
              }
            : {
                name: clubName,
                address: address,
                lat: 40.7589,
                long: -73.9851
              };

          // LA Fitness classes are included with membership
          const price = 0.00;

          // Determine intensity based on category and level
          let intensity = 5; // Default moderate
          const categoryLower = (classInfo.category + ' ' + classInfo.className).toLowerCase();
          const levelLower = classInfo.level.toLowerCase();

          if (categoryLower.includes('hiit') || categoryLower.includes('bootcamp') || categoryLower.includes('cycling')) {
            intensity = 8;
          } else if (categoryLower.includes('cardio') || categoryLower.includes('zumba') || categoryLower.includes('dance')) {
            intensity = 6;
          } else if (categoryLower.includes('yoga') || categoryLower.includes('pilates') || categoryLower.includes('stretch')) {
            intensity = 4;
          } else if (categoryLower.includes('strength') || categoryLower.includes('weights') || categoryLower.includes('power')) {
            intensity = 6;
          } else if (categoryLower.includes('aqua') || categoryLower.includes('water')) {
            intensity = 5;
          }

          // Adjust for level
          if (levelLower.includes('beginner') || levelLower.includes('gentle')) {
            intensity = Math.max(1, intensity - 2);
          } else if (levelLower.includes('advanced') || levelLower.includes('intense')) {
            intensity = Math.min(10, intensity + 2);
          }

          // Parse capacity (LA Fitness classes vary by room size)
          const capacity = 40; // Typical group fitness class size

          // Build description
          const description = classInfo.description ||
            `${classInfo.className} group fitness class at LA Fitness. Included with membership.`;

          // Determine tags
          const tags = parseTags(classInfo.className + ' ' + classInfo.category);
          if (categoryLower.includes('mind & body')) tags.push('mind-body');
          if (classInfo.room?.toLowerCase().includes('pool')) tags.push('aqua');

          // Create fitness class
          const fitnessClass: FitnessClass = {
            name: sanitizeString(classInfo.className),
            description: sanitizeString(description),
            datetime,
            location: locationData,
            trainer: sanitizeString(classInfo.instructor) || 'LA Fitness Instructor',
            intensity,
            price,
            bookingUrl: scheduleUrl,
            providerId: `lafitness-${clubName}-${datetime.getTime()}-${classInfo.className}`,
            providerName: this.name,
            capacity,
            tags
          };

          // Validate and add
          if (this.validateClass(fitnessClass)) {
            classes.push(fitnessClass);
            this.logProgress(`Scraped: ${fitnessClass.name} at ${clubName}`);
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
          const errorMsg = `Error processing LA Fitness class ${i}: ${error}`;
          this.logError(errorMsg);
          errors.push(errorMsg);
        }
      }

      this.logProgress(`LA Fitness scrape complete. Found ${classes.length} classes`);

    } catch (error) {
      const errorMsg = `LA Fitness scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
      return this.createScrapeResult(classes, false, errors);

    } finally {
      await this.chromeManager.closePage(page);
    }

    return this.createScrapeResult(classes, true, errors);
  }
}
