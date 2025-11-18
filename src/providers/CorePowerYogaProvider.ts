import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for CorePower Yoga
 * CorePower Yoga is a modern yoga studio chain offering various yoga styles
 *
 * Note: This implementation is a template based on typical yoga studio structures.
 * Actual selectors would need to be adjusted based on CorePower's website.
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
      const scheduleSelector = '.schedule-container, .class-list, [data-schedule], .yoga-schedule';

      try {
        await page.waitForSelector(scheduleSelector, { timeout: 10000 });
      } catch (error) {
        this.logError('Schedule container not found. Site structure may have changed.');
        errors.push('Schedule not found');
        return this.createScrapeResult(classes, false, errors);
      }

      // Extract all class cards/items
      const classCards = await page.$$('.class-card, .yoga-class, .schedule-item, .class-listing');
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
              instructor: getTextContent('.instructor-name, .instructor, .teacher, [data-instructor]'),
              time: getTextContent('.class-time, .time'),
              date: getTextContent('.class-date, .date') || getAttribute('[data-date]', 'data-date'),
              duration: getTextContent('.duration, .class-duration'),
              description: getTextContent('.class-description, .description, p'),
              location: getTextContent('.location, .studio-name'),
              level: getTextContent('.level, .difficulty'),
              temperature: getTextContent('.temperature, .heated'),
              spots: getTextContent('.spots-available, .spots, .availability'),
              price: getTextContent('.price, .class-price'),
              bookingLink: getAttribute('a.book-now, .booking-link, a', 'href')
            };
          }, classCards[i]);

          // CorePower has different class types (C1, C2, Yoga Sculpt, Hot Power Fusion, etc.)
          const className = classInfo.name || 'CorePower Yoga';

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

          // Parse intensity based on class type and level
          let intensity = 5; // Default moderate
          if (className.toLowerCase().includes('sculpt') || className.toLowerCase().includes('power')) {
            intensity = 7;
          } else if (className.toLowerCase().includes('c2')) {
            intensity = 6;
          } else if (className.toLowerCase().includes('c1')) {
            intensity = 4;
          } else if (classInfo.level) {
            intensity = parseIntensity(classInfo.level);
          }

          // Parse capacity (yoga studios typically have limited capacity)
          const capacity = this.parseCapacity(classInfo.spots) || 30;

          // Parse price (CorePower typically has per-class or membership pricing)
          const price = classInfo.price ? this.parsePrice(classInfo.price) : 25.0;

          // Generate description
          let description = sanitizeString(classInfo.description);
          if (!description) {
            if (className.toLowerCase().includes('sculpt')) {
              description = 'High-energy, full-body workout combining yoga poses, cardio, and strength training with weights set to music.';
            } else if (className.toLowerCase().includes('hot')) {
              description = 'Powerful flow yoga class practiced in a heated room to build strength, flexibility, and detoxify.';
            } else {
              description = 'Dynamic yoga class that combines physical practice with breath work and meditation.';
            }
          }

          // Add temperature info if heated class
          const tags = parseTags('yoga ' + className + ' ' + classInfo.description + ' ' + classInfo.level);
          if (classInfo.temperature && classInfo.temperature.toLowerCase().includes('heat')) {
            tags.push('hot-yoga');
          }

          // Create fitness class object
          const fitnessClass: FitnessClass = {
            name: sanitizeString(className),
            description,
            datetime,
            location: locationData,
            trainer: sanitizeString(classInfo.instructor) || 'CorePower Instructor',
            intensity,
            price,
            bookingUrl: this.normalizeUrl(classInfo.bookingLink) || scheduleUrl,
            providerId: `corepoweryoga-${locationName}-${datetime.getTime()}-${className}`,
            providerName: this.name,
            capacity,
            tags
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
