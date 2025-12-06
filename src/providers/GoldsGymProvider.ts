import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for Gold's Gym
 * Gold's Gym is a classic gym chain with extensive group fitness classes
 *
 * URL pattern: https://www.goldsgym.com/[location-slug]/class-schedule/
 * Examples:
 * - https://www.goldsgym.com/arcadia-santa-anita/class-schedule/
 * - https://www.goldsgym.com/austinsouthtx/class-schedule/
 */
export class GoldsGymProvider extends BaseProvider {
  readonly name = 'goldsgym';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting Gold\'s Gym scrape');

    const page = await this.chromeManager.newPage();

    try {
      // Build the schedule URL
      const location = options.location || this.config.defaultLocation || 'arcadia-santa-anita';
      const scheduleUrl = `${this.config.baseUrl}/${location}/class-schedule/`;

      await this.chromeManager.navigateWithRetry(page, scheduleUrl);
      this.logProgress(`Loaded schedule page for location: ${location}`);

      // Wait for page to load and potentially render dynamic content
      // Try multiple strategies to find the schedule
      let scheduleFound = false;
      const possibleSelectors = [
        '.schedule-container',
        '.class-schedule',
        '.class-list',
        '.group-fitness-schedule',
        '[data-schedule]',
        '.schedule',
        '.classes',
        '[class*="schedule"]',
        '[id*="schedule"]',
        '.calendar-event',
        '.event',
        'article.class',
        'div.class'
      ];

      for (const selector of possibleSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          this.logProgress(`Found schedule using selector: ${selector}`);
          scheduleFound = true;
          break;
        } catch {
          // Try next selector
          continue;
        }
      }

      if (!scheduleFound) {
        // Try waiting for any content to load
        try {
          await page.waitForFunction(
            'document.body.textContent && document.body.textContent.length > 1000',
            { timeout: 10000 }
          );
          this.logProgress('Page loaded, attempting to find classes without specific selector');
        } catch (error) {
          this.logError('Could not find schedule container. Site structure may have changed.');
          errors.push('Schedule not found');
          return this.createScrapeResult(classes, false, errors);
        }
      }

      // Screenshots can be taken for debugging if needed
      // await page.screenshot({ path: 'goldsgym-debug.png', fullPage: true });

      // Extract all potential class cards/items using multiple selectors
      const classCardSelectors = [
        '.class-card',
        '.fitness-class',
        '.schedule-item',
        '.class-item',
        '.group-class',
        '.calendar-event',
        '.event-item',
        'article.class',
        '[data-class]',
        '.class',
        '[class*="class-"]'
      ];

      let classCards: any[] = [];
      for (const selector of classCardSelectors) {
        const cards = await page.$$(selector);
        if (cards.length > 0) {
          classCards = cards;
          this.logProgress(`Found ${cards.length} potential classes using selector: ${selector}`);
          break;
        }
      }

      if (classCards.length === 0) {
        this.logError('No class cards found on the page');
        errors.push('No classes found');
        return this.createScrapeResult(classes, false, errors);
      }

      // Process each class card
      for (let i = 0; i < classCards.length; i++) {
        try {
          const classInfo = await page.evaluate((card: any) => {
            const getTextContent = (selector: string): string => {
              const el = card.querySelector(selector);
              return el?.textContent?.trim() || '';
            };

            const getAttribute = (selector: string, attr: string): string => {
              const el = card.querySelector(selector);
              return el?.getAttribute(attr) || '';
            };

            // Try multiple selector patterns for each field
            const name = getTextContent('.class-title') ||
                        getTextContent('.class-name') ||
                        getTextContent('h3') ||
                        getTextContent('h4') ||
                        getTextContent('h2') ||
                        getTextContent('[data-class-name]') ||
                        getAttribute('[data-class-name]', 'data-class-name');

            const instructor = getTextContent('.instructor-name') ||
                             getTextContent('.instructor') ||
                             getTextContent('.teacher') ||
                             getTextContent('[data-instructor]') ||
                             getAttribute('[data-instructor]', 'data-instructor');

            const time = getTextContent('.class-time') ||
                        getTextContent('.time') ||
                        getTextContent('.start-time') ||
                        getTextContent('[data-time]') ||
                        getAttribute('[data-time]', 'data-time');

            const date = getTextContent('.class-date') ||
                        getTextContent('.date') ||
                        getAttribute('[data-date]', 'data-date');

            const duration = getTextContent('.duration') ||
                           getTextContent('.class-duration') ||
                           getAttribute('[data-duration]', 'data-duration');

            const description = getTextContent('.class-description') ||
                              getTextContent('.description') ||
                              getTextContent('p');

            const room = getTextContent('.location') ||
                        getTextContent('.room') ||
                        getTextContent('.studio');

            const level = getTextContent('.level') ||
                         getTextContent('.intensity') ||
                         getTextContent('.difficulty');

            const spotsAvailable = getTextContent('.spots') ||
                                 getTextContent('.availability') ||
                                 getTextContent('.capacity');

            const bookingLink = getAttribute('a.book-now', 'href') ||
                              getAttribute('.booking-link', 'href') ||
                              getAttribute('a.reserve', 'href') ||
                              getAttribute('a', 'href');

            const classType = getTextContent('.class-type') ||
                            getTextContent('.category') ||
                            getTextContent('.format');

            return {
              name,
              instructor,
              time,
              date,
              duration,
              description,
              room,
              level,
              spotsAvailable,
              bookingLink,
              classType
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
          const locationName = classInfo.room || `Gold's Gym ${location}`;
          const address = `Gold's Gym ${location}`;

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
                lat: 40.7589, // Default coordinates (placeholder)
                long: -73.9851
              };

          // Determine intensity based on class type
          let intensity = 5; // Default medium intensity
          const className = classInfo.name.toLowerCase();

          if (className.includes('spin') || className.includes('cycle') ||
              className.includes('hiit') || className.includes('bootcamp') ||
              className.includes('boxing') || className.includes('combat')) {
            intensity = 8;
          } else if (className.includes('yoga') || className.includes('pilates') ||
                    className.includes('stretch') || className.includes('gentle')) {
            intensity = 4;
          } else if (className.includes('zumba') || className.includes('dance')) {
            intensity = 6;
          } else if (className.includes('strength') || className.includes('weights') ||
                    className.includes('pump') || className.includes('power')) {
            intensity = 7;
          } else if (classInfo.level) {
            intensity = parseIntensity(classInfo.level);
          }

          // Parse capacity (typical gym class size)
          const capacity = this.parseCapacity(classInfo.spotsAvailable) || 30;

          // Gold's Gym classes are typically free for members
          const price = 0;

          // Create fitness class object
          const fitnessClass: FitnessClass = {
            name: sanitizeString(classInfo.name),
            description: sanitizeString(classInfo.description) || 'Group fitness class at Gold\'s Gym',
            datetime,
            location: locationData,
            trainer: sanitizeString(classInfo.instructor) || 'Instructor',
            intensity,
            price,
            bookingUrl: this.normalizeUrl(classInfo.bookingLink) || scheduleUrl,
            providerId: `goldsgym-${datetime.getTime()}-${classInfo.name}-${location}`,
            providerName: this.name,
            capacity,
            tags: parseTags('group fitness gym ' + classInfo.name + ' ' + classInfo.description + ' ' + classInfo.classType)
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

      this.logProgress(`Gold's Gym scrape complete. Found ${classes.length} classes`);

    } catch (error) {
      const errorMsg = `Gold's Gym scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
      return this.createScrapeResult(classes, false, errors);

    } finally {
      await this.chromeManager.closePage(page);
    }

    return this.createScrapeResult(classes, true, errors);
  }
}
