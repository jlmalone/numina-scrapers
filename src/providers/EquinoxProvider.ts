import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for Equinox gym chain
 * Equinox is a luxury fitness club chain with premium group classes
 *
 * Note: This implementation is a template based on typical gym website structures.
 * You'll need to inspect Equinox's actual website and adjust selectors.
 */
export class EquinoxProvider extends BaseProvider {
  readonly name = 'equinox';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting Equinox scrape');

    const page = await this.chromeManager.newPage();

    try {
      // Navigate to the class schedule page
      // Equinox typically has location-specific schedules
      const location = options.location || this.config.defaultLocation || 'new-york';
      const scheduleUrl = `${this.config.baseUrl}/clubs/${location}/schedule`;

      await this.chromeManager.navigateWithRetry(page, scheduleUrl);
      this.logProgress(`Loaded schedule page for location: ${location}`);

      // Wait for schedule container
      const scheduleSelector = '.schedule-container, .class-schedule, [data-schedule]';

      try {
        await page.waitForSelector(scheduleSelector, { timeout: 10000 });
      } catch (error) {
        this.logError('Schedule container not found. Site structure may have changed.');
        errors.push('Schedule not found');
        return this.createScrapeResult(classes, false, errors);
      }

      // Extract all class cards/items
      const classCards = await page.$$('.class-card, .schedule-class, .group-class-item');
      this.logProgress(`Found ${classCards.length} potential classes`);

      for (let i = 0; i < classCards.length; i++) {
        try {
          const classInfo = await page.evaluate((card) => {
            // Extract data from card (adjust selectors based on actual site)
            const getTextContent = (selector: string): string => {
              const el = card.querySelector(selector);
              return el?.textContent?.trim() || '';
            };

            const getAttribute = (selector: string, attr: string): string => {
              const el = card.querySelector(selector);
              return el?.getAttribute(attr) || '';
            };

            // Extract photos
            const photoEls = card.querySelectorAll('img.class-image, .photo img, .gallery img, .thumbnail img');
            const photos = Array.from(photoEls).map((img: any) =>
              img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src')
            ).filter(url => url && url.startsWith('http'));

            return {
              name: getTextContent('.class-title, .class-name, h3, h4'),
              instructor: getTextContent('.instructor-name, .teacher, [data-instructor]'),
              time: getTextContent('.class-time, .time'),
              date: getTextContent('.class-date, .date') || getAttribute('[data-date]', 'data-date'),
              duration: getTextContent('.duration, .class-duration'),
              description: getTextContent('.class-description, .description, p'),
              location: getTextContent('.location, .studio'),
              level: getTextContent('.level, .intensity'),
              spotsAvailable: getTextContent('.spots, .availability'),
              bookingLink: getAttribute('a.book-now, .booking-link', 'href'),
              // Enhanced fields
              instructorBio: getTextContent('.instructor-bio, .trainer-bio'),
              instructorPhoto: getAttribute('.instructor-photo img, .trainer-photo img', 'src'),
              amenitiesText: getTextContent('.amenities, .facilities, .club-features'),
              bookingStatus: getTextContent('.status, .booking-status'),
              pricingInfo: getTextContent('.pricing, .membership-info'),
              rating: getTextContent('.rating, .reviews, [data-rating]'),
              photos: photos.slice(0, 5)
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
          const locationName = classInfo.location || `Equinox ${location}`;
          const address = `Equinox ${location}`; // In production, maintain a location database

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

          // Parse intensity from level
          let intensity = 5;
          if (classInfo.level) {
            intensity = parseIntensity(classInfo.level);
          } else if (classInfo.description) {
            intensity = parseIntensity(classInfo.description);
          }

          // Determine capacity (Equinox classes typically have limited spots)
          const capacity = this.parseCapacity(classInfo.spotsAvailable) || 25;

          // Parse enhanced fields
          const realTimeAvailability = this.parseAvailability(classInfo.spotsAvailable);
          const bookingStatus = this.parseBookingStatus(
            classInfo.bookingStatus || classInfo.spotsAvailable || '',
            realTimeAvailability
          );
          const amenities = classInfo.amenitiesText
            ? this.parseAmenities(classInfo.amenitiesText)
            : [
                { type: 'locker', available: true },
                { type: 'shower', available: true },
                { type: 'equipment', available: true }
              ]; // Default Equinox amenities
          const trainerInfo = classInfo.instructorBio || classInfo.instructorPhoto
            ? this.parseTrainerInfo(
                sanitizeString(classInfo.instructor) || 'Staff',
                classInfo.instructorBio ? sanitizeString(classInfo.instructorBio) : undefined,
                classInfo.instructorPhoto || undefined
              )
            : undefined;

          // Create fitness class object
          const fitnessClass: FitnessClass = {
            name: sanitizeString(classInfo.name),
            description: sanitizeString(classInfo.description),
            datetime,
            location: locationData,
            trainer: sanitizeString(classInfo.instructor) || 'Staff',
            intensity,
            price: 0, // Equinox is membership-based, classes typically included
            bookingUrl: this.normalizeUrl(classInfo.bookingLink) || scheduleUrl,
            providerId: `equinox-${locationName}-${datetime.getTime()}-${classInfo.name}`,
            providerName: this.name,
            capacity,
            tags: parseTags(classInfo.name + ' ' + classInfo.description + ' ' + classInfo.level),
            // Enhanced fields
            photos: classInfo.photos.length > 0 ? classInfo.photos : undefined,
            trainerInfo,
            amenities,
            realTimeAvailability,
            bookingStatus,
            lastAvailabilityCheck: new Date(),
            pricingDetails: classInfo.pricingInfo
              ? this.parsePricingDetails(classInfo.pricingInfo, 0)
              : { membership: { monthly: 0, description: 'Included with membership' } }
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

      this.logProgress(`Equinox scrape complete. Found ${classes.length} classes`);

    } catch (error) {
      const errorMsg = `Equinox scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
      return this.createScrapeResult(classes, false, errors);

    } finally {
      await this.chromeManager.closePage(page);
    }

    return this.createScrapeResult(classes, true, errors);
  }
}
