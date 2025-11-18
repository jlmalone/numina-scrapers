import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for Planet Fitness
 * Large budget gym chain with 2000+ locations
 * Offers basic group fitness classes (circuit training, stretch, cardio)
 *
 * Note: Planet Fitness is primarily an open gym model. Group classes vary by location.
 * Some locations may have limited class schedules.
 */
export class PlanetFitnessProvider extends BaseProvider {
  readonly name = 'planetfitness';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting Planet Fitness scrape');

    const page = await this.chromeManager.newPage();

    try {
      // Navigate to Planet Fitness location page
      const location = options.location || this.config.defaultLocation || 'new-york';
      const scheduleUrl = `${this.config.baseUrl}/gyms/${location}`;

      await this.chromeManager.navigateWithRetry(page, scheduleUrl);
      this.logProgress(`Loaded Planet Fitness page for: ${location}`);

      // Wait for schedule/classes section
      const scheduleSelector = '.class-schedule, .amenities, [data-classes]';

      try {
        await page.waitForSelector(scheduleSelector, { timeout: 15000 });
      } catch (error) {
        this.logError('Classes section not found. This location may not offer group classes.');
        errors.push('Classes section not found');
        return this.createScrapeResult(classes, false, errors);
      }

      // Extract class information
      const classElements = await page.$$('.class-item, .group-class, .fitness-class');
      this.logProgress(`Found ${classElements.length} Planet Fitness classes`);

      // Planet Fitness may have limited class info, so we'll handle sparse data
      for (let i = 0; i < classElements.length; i++) {
        try {
          const classInfo = await page.evaluate((el) => {
            const getText = (selector: string): string => {
              return el.querySelector(selector)?.textContent?.trim() || '';
            };

            const getAttr = (selector: string, attr: string): string => {
              return el.querySelector(selector)?.getAttribute(attr) || '';
            };

            return {
              className: getText('.class-name, .title, h4'),
              time: getText('.time, .class-time') || getAttr('[data-time]', 'data-time'),
              date: getText('.date, .day') || getAttr('[data-date]', 'data-date'),
              duration: getText('.duration'),
              description: getText('.description, .class-info'),
              gymName: getText('.gym-name, .location'),
              instructor: getText('.instructor, .staff'),
              classType: getText('.type, .category') // e.g., "Circuit", "Cardio", "Stretch"
            };
          }, classElements[i]);

          // Skip if no class name
          if (!classInfo.className) {
            continue;
          }

          // Parse datetime - if no specific time, use a default
          const datetime = this.parseDateTime(classInfo.date, classInfo.time);
          if (!datetime) {
            // Planet Fitness might just show "Monday", "Tuesday" without specific times
            // Skip classes without parseable datetime
            continue;
          }

          // Check date range
          if (!this.isWithinDateRange(datetime, options)) {
            continue;
          }

          // Get gym location
          const gymName = classInfo.gymName || `Planet Fitness ${location}`;
          const address = gymName;

          // Geocode location
          const geocoded = await geocodeAddress(address);
          const locationData = geocoded
            ? {
                name: gymName,
                address: geocoded.formattedAddress,
                lat: geocoded.lat,
                long: geocoded.long
              }
            : {
                name: gymName,
                address: address,
                lat: 40.7589,
                long: -73.9851
              };

          // Planet Fitness is included with membership (no additional cost)
          const price = 0.00;

          // Determine intensity based on class type
          let intensity = 4; // Default moderate-low
          const classTypeLower = (classInfo.className + ' ' + classInfo.classType).toLowerCase();

          if (classTypeLower.includes('circuit') || classTypeLower.includes('30-minute express')) {
            intensity = 6;
          } else if (classTypeLower.includes('cardio')) {
            intensity = 5;
          } else if (classTypeLower.includes('stretch') || classTypeLower.includes('core')) {
            intensity = 3;
          }

          // Parse capacity (Planet Fitness classes are typically small)
          const capacity = 20; // Typical small group class

          // Build description
          const description = classInfo.description ||
            `${classInfo.className} group fitness class at Planet Fitness. Included with membership.`;

          // Determine tags
          const tags = parseTags(classInfo.className + ' ' + classInfo.classType);
          if (classTypeLower.includes('circuit')) tags.push('circuit');
          if (classTypeLower.includes('cardio')) tags.push('cardio');
          if (classTypeLower.includes('stretch')) tags.push('stretching');
          if (classTypeLower.includes('core')) tags.push('core');

          // Create fitness class
          const fitnessClass: FitnessClass = {
            name: sanitizeString(classInfo.className),
            description: sanitizeString(description),
            datetime,
            location: locationData,
            trainer: sanitizeString(classInfo.instructor) || 'Planet Fitness Staff',
            intensity,
            price,
            bookingUrl: scheduleUrl, // Planet Fitness typically doesn't require booking
            providerId: `planetfitness-${gymName}-${datetime.getTime()}-${classInfo.className}`,
            providerName: this.name,
            capacity,
            tags
          };

          // Validate and add
          if (this.validateClass(fitnessClass)) {
            classes.push(fitnessClass);
            this.logProgress(`Scraped: ${fitnessClass.name} at ${gymName}`);
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
          const errorMsg = `Error processing Planet Fitness class ${i}: ${error}`;
          this.logError(errorMsg);
          errors.push(errorMsg);
        }
      }

      this.logProgress(`Planet Fitness scrape complete. Found ${classes.length} classes`);

    } catch (error) {
      const errorMsg = `Planet Fitness scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
      return this.createScrapeResult(classes, false, errors);

    } finally {
      await this.chromeManager.closePage(page);
    }

    return this.createScrapeResult(classes, true, errors);
  }
}
