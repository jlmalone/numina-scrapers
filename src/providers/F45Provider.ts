import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for F45 Training
 * Functional training studio with 45-minute team workouts
 * Offers different workout types each day (cardio, resistance, hybrid)
 *
 * Note: F45 uses a franchise model with location-specific schedules
 * Workouts change daily following a specific program calendar
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
      // Navigate to F45 schedule
      const location = options.location || this.config.defaultLocation || 'new-york';
      const scheduleUrl = `${this.config.baseUrl}/studios/${location}/timetable`;

      await this.chromeManager.navigateWithRetry(page, scheduleUrl);
      this.logProgress(`Loaded F45 schedule for: ${location}`);

      // Wait for timetable
      const scheduleSelector = '.timetable, .class-schedule, [data-timetable]';

      try {
        await page.waitForSelector(scheduleSelector, { timeout: 15000 });
      } catch (error) {
        this.logError('Timetable not found. May need authentication or different selectors.');
        errors.push('Timetable not found');
        return this.createScrapeResult(classes, false, errors);
      }

      // Extract class sessions
      const classSessions = await page.$$('.session, .workout-slot, .class-time');
      this.logProgress(`Found ${classSessions.length} F45 sessions`);

      for (let i = 0; i < classSessions.length; i++) {
        try {
          const sessionData = await page.evaluate((session) => {
            const getText = (selector: string): string => {
              return session.querySelector(selector)?.textContent?.trim() || '';
            };

            const getAttr = (selector: string, attr: string): string => {
              return session.querySelector(selector)?.getAttribute(attr) || '';
            };

            return {
              workoutName: getText('.workout-name, .class-name, h3'), // e.g., "Romans", "Pipeline"
              workoutType: getText('.workout-type, .category'), // Cardio, Resistance, or Hybrid
              time: getText('.time, .session-time') || getAttr('[data-time]', 'data-time'),
              date: getText('.date, .day') || getAttr('[data-date]', 'data-date'),
              duration: '45 minutes', // F45 = 45 minutes
              description: getText('.description, .workout-description'),
              studioName: getText('.studio-name, .location'),
              trainer: getText('.trainer, .coach'),
              price: getText('.price, .cost'),
              spotsAvailable: getText('.spots, .capacity'),
              bookingUrl: getAttr('a.book, .join-session', 'href'),
              focus: getText('.focus, .target') // e.g., "Full Body", "Upper Body"
            };
          }, classSessions[i]);

          // Skip if no workout name
          if (!sessionData.workoutName) {
            continue;
          }

          // Parse datetime
          const datetime = this.parseDateTime(sessionData.date, sessionData.time);
          if (!datetime) {
            this.logError(`Could not parse datetime: ${sessionData.date} ${sessionData.time}`);
            continue;
          }

          // Check date range
          if (!this.isWithinDateRange(datetime, options)) {
            continue;
          }

          // Get studio location
          const studioName = sessionData.studioName || `F45 Training ${location}`;
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

          // Parse price (F45 typically uses memberships)
          const price = this.parsePrice(sessionData.price) || 30.00; // Typical drop-in rate

          // Determine intensity based on workout type
          let intensity = 7; // Default high
          const workoutTypeLower = sessionData.workoutType.toLowerCase();

          if (workoutTypeLower.includes('cardio')) {
            intensity = 8;
          } else if (workoutTypeLower.includes('resistance') || workoutTypeLower.includes('strength')) {
            intensity = 7;
          } else if (workoutTypeLower.includes('hybrid')) {
            intensity = 8;
          }

          // Parse capacity
          const capacity = this.parseCapacity(sessionData.spotsAvailable) || 36; // Typical F45 class size

          // Build class name with workout type
          const className = sessionData.workoutType
            ? `F45 ${sessionData.workoutName} (${sessionData.workoutType})`
            : `F45 ${sessionData.workoutName}`;

          // Build description
          let description = sessionData.description ||
            `45-minute functional training workout: ${sessionData.workoutName}.`;

          if (sessionData.focus) {
            description += ` Focus: ${sessionData.focus}.`;
          }

          // Determine tags based on workout type
          const tags = ['functional', 'hiit', 'team-training'];
          if (workoutTypeLower.includes('cardio')) {
            tags.push('cardio');
          }
          if (workoutTypeLower.includes('resistance') || workoutTypeLower.includes('strength')) {
            tags.push('strength', 'resistance');
          }
          if (workoutTypeLower.includes('hybrid')) {
            tags.push('cardio', 'strength', 'hybrid');
          }

          // Create fitness class
          const fitnessClass: FitnessClass = {
            name: sanitizeString(className),
            description: sanitizeString(description),
            datetime,
            location: locationData,
            trainer: sanitizeString(sessionData.trainer) || 'F45 Coach',
            intensity,
            price,
            bookingUrl: this.normalizeUrl(sessionData.bookingUrl) || scheduleUrl,
            providerId: `f45-${studioName}-${datetime.getTime()}-${sessionData.workoutName}`,
            providerName: this.name,
            capacity,
            tags
          };

          // Validate and add
          if (this.validateClass(fitnessClass)) {
            classes.push(fitnessClass);
            this.logProgress(`Scraped: ${fitnessClass.name} at ${studioName}`);
          } else {
            this.logError(`Invalid class: ${sessionData.workoutName}`);
          }

          // Respect rate limits
          await this.respectRateLimit();

          // Check max results
          if (options.maxResults && classes.length >= options.maxResults) {
            break;
          }

        } catch (error) {
          const errorMsg = `Error processing F45 session ${i}: ${error}`;
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
