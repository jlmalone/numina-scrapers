import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for Equinox gym chain
 * Uses the Equinox API endpoint for class schedules
 */
export class EquinoxProvider extends BaseProvider {
  readonly name = 'equinox';
  private readonly apiEndpoint = 'https://api.equinox.com/v6/groupfitness/classes/allclasses';

  // Equinox facility IDs (can be extended to support multiple locations)
  private readonly facilityMap: Record<string, number> = {
    'canada/vancouver/westgeorgiast': 860,
    'westgeorgiast': 860,
    'vancouver': 860
  };

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting Equinox API scrape');

    // Determine facility ID from location
    const location = (options.location || this.config.defaultLocation || 'vancouver').toLowerCase();
    const facilityId = this.facilityMap[location] || 860;

    this.logProgress(`Using facility ID: ${facilityId} for location: ${location}`);

    // Prepare date range
    const startDate = options.startDate || new Date();
    const endDate = options.endDate || new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000); // Default: 7 days

    const startDateStr = this.formatDate(startDate);
    const endDateStr = this.formatDate(endDate);

    this.logProgress(`Date range: ${startDateStr} to ${endDateStr}`);

    try {
      // Make API request using Puppeteer to handle CORS and cookies
      const page = await this.chromeManager.newPage();

      try {
        // Navigate to the club page first to establish session
        const clubUrl = `${this.config.baseUrl}/clubs/canada/vancouver/westgeorgiast`;
        await this.chromeManager.navigateWithRetry(page, clubUrl);
        await this.delay(2000);

        // Make API request via page.evaluate to bypass CORS
        const apiResponse = await page.evaluate(async (apiUrl, payload) => {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
          }

          return await response.json();
        }, this.apiEndpoint, {
          startDate: startDateStr,
          endDate: endDateStr,
          facilityIds: [facilityId],
          isBookingRequired: false
        });

        this.logProgress(`API response received: ${apiResponse.classes?.length || 0} classes found`);

        // Process classes from API response
        if (apiResponse.classes && Array.isArray(apiResponse.classes)) {
          for (const classData of apiResponse.classes) {
            try {
              const fitnessClass = this.transformApiClass(classData, facilityId);

              if (fitnessClass && this.validateClass(fitnessClass)) {
                classes.push(fitnessClass);
                this.logProgress(`Scraped: ${fitnessClass.name} on ${new Date(fitnessClass.datetime).toLocaleString()}`);

                // Check max results limit
                if (options.maxResults && classes.length >= options.maxResults) {
                  this.logProgress(`Reached max results limit: ${options.maxResults}`);
                  break;
                }
              }
            } catch (error) {
              const errorMsg = `Error processing class: ${error}`;
              this.logError(errorMsg);
              errors.push(errorMsg);
            }
          }
        } else {
          const errorMsg = 'Invalid API response format';
          this.logError(errorMsg);
          errors.push(errorMsg);
        }

        this.logProgress(`Equinox scrape complete. Found ${classes.length} valid classes`);

      } finally {
        await this.chromeManager.closePage(page);
      }

    } catch (error) {
      const errorMsg = `Equinox API scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
      return this.createScrapeResult(classes, false, errors);
    }

    return this.createScrapeResult(classes, true, errors);
  }

  /**
   * Transform API class data to FitnessClass format
   */
  private transformApiClass(apiClass: any, facilityId: number): FitnessClass | null {
    try {
      // Extract class name - API uses "name" field
      const className = apiClass.name || 'Unknown Class';
      const classDescription = apiClass.classDescription || '';

      // Parse dates - API returns ISO 8601 dates
      const startDate = new Date(apiClass.startDate);
      const endDate = new Date(apiClass.endDate);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        this.logError(`Invalid dates for class: ${className}`);
        return null;
      }

      // Extract instructor information
      let instructorName = 'Staff';
      let trainerInfo = undefined;

      if (apiClass.instructors && apiClass.instructors.length > 0) {
        const primaryInstructor = apiClass.instructors[0].instructor;
        instructorName = sanitizeString(`${primaryInstructor.firstName} ${primaryInstructor.lastName}`);

        const instructorAvatar = primaryInstructor.instructorAvatar?.[0];
        trainerInfo = {
          name: instructorName,
          bio: primaryInstructor.bio ? sanitizeString(primaryInstructor.bio) : undefined,
          photoUrl: instructorAvatar?.avatarHeadshotsImageUrl || instructorAvatar?.avatarThumbnailImageUrl || undefined
        };
      }

      // Parse capacity and availability
      const capacity = apiClass.status?.totalReservableItems || 25;
      const enrolled = apiClass.status?.totalReserved || 0;
      const spotsAvailable = capacity - enrolled;

      // Determine booking status
      let bookingStatus: 'open' | 'closed' | 'full' | 'waitlist' | undefined;
      if (apiClass.status?.isClassFull) {
        bookingStatus = 'full';
      } else if (apiClass.status?.isWithinReservationPeriod) {
        bookingStatus = 'open';
      } else {
        bookingStatus = 'closed';
      }

      // Parse intensity from class level
      let intensity = 5; // Default medium intensity
      if (apiClass.classLevel?.content) {
        const levelText = apiClass.classLevel.content.toLowerCase();
        if (levelText.includes('beginner') || levelText.includes('all levels')) {
          intensity = 3;
        } else if (levelText.includes('advanced') || levelText.includes('high')) {
          intensity = 8;
        }
      }

      // Build location data
      const locationData = {
        name: `Equinox - ${apiClass.studioName || 'Main Studio'}`,
        address: 'Equinox West Georgia Street, 1131 West Georgia Street, Vancouver, BC V6E 2X5',
        lat: 49.2826, // Vancouver Equinox coordinates
        long: -123.1207
      };

      // Extract tags from class title and description
      const tags: string[] = [];
      if (className && typeof className === 'string' && className !== 'Unknown Class') {
        tags.push(sanitizeString(className));
      }
      if (apiClass.primaryCategory?.name) tags.push(apiClass.primaryCategory.name);
      if (apiClass.classLevel?.content) tags.push(apiClass.classLevel.content);
      if (apiClass.timeSlot) tags.push(apiClass.timeSlot); // Morning, Afternoon, Evening

      // Extract class ID - try multiple possible field names
      const classId = apiClass.classInstanceID || apiClass.classInstanceId ||
                      apiClass.id || apiClass.classId || apiClass.instanceId ||
                      apiClass.reservationId || apiClass.classScheduleID ||
                      apiClass.scheduleId;

      // Log error if no ID found
      if (!classId) {
        this.logError(`No class ID found for ${className}. Available fields: ${Object.keys(apiClass).slice(0, 20).join(', ')}...`);
      }

      // Build FitnessClass object
      const fitnessClass: FitnessClass = {
        name: sanitizeString(className),
        description: sanitizeString(classDescription),
        datetime: startDate,
        location: locationData,
        trainer: instructorName,
        intensity,
        price: 0, // Equinox is membership-based
        bookingUrl: classId ? `https://www.equinox.com/groupfitness/${classId}` : `https://www.equinox.com/clubs/canada/vancouver/westgeorgiast`,
        providerId: `equinox-${facilityId}-${classId || Date.now()}`,
        providerName: this.name,
        capacity,
        tags,

        // Enhanced fields
        photos: apiClass.imageURL ? [
          apiClass.imageURL.startsWith('//') ? `https:${apiClass.imageURL}` : apiClass.imageURL
        ] : undefined,
        trainerInfo,
        amenities: [
          { type: 'locker', available: true },
          { type: 'shower', available: true },
          { type: 'equipment', available: true }
        ],
        realTimeAvailability: spotsAvailable > 0 ? spotsAvailable : 0,
        bookingStatus,
        lastAvailabilityCheck: new Date(),
        pricingDetails: {
          membership: {
            monthly: 0,
            description: 'Included with Equinox membership'
          }
        }
      };

      return fitnessClass;

    } catch (error) {
      this.logError(`Error transforming class data: ${error}`);
      return null;
    }
  }

  /**
   * Format date as YYYY-MM-DD for API
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
