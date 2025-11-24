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

  // Equinox facility IDs for major locations
  private readonly facilityMap: Record<string, { id: number; name: string; clubUrl: string }> = {
    // Vancouver
    'vancouver': { id: 860, name: 'Equinox West Georgia Street', clubUrl: 'https://www.equinox.com/clubs/canada/vancouver/westgeorgiast' },
    'westgeorgiast': { id: 860, name: 'Equinox West Georgia Street', clubUrl: 'https://www.equinox.com/clubs/canada/vancouver/westgeorgiast' },

    // New York City
    'nyc-hudsonyards': { id: 138, name: 'Equinox Hudson Yards', clubUrl: 'https://www.equinox.com/clubs/new-york/midtown/hudsonyards' },
    'nyc-columbuscircle': { id: 113, name: 'Equinox Columbus Circle', clubUrl: 'https://www.equinox.com/clubs/new-york/uptown/columbuscircle' },

    // Los Angeles
    'la-sportsclub': { id: 713, name: 'Equinox Sports Club LA', clubUrl: 'https://www.equinox.com/clubs/southern-california/los-angeles/losangeles' },

    // San Francisco
    'sf-sportsclub': { id: 724, name: 'Equinox Sports Club SF', clubUrl: 'https://www.equinox.com/clubs/northern-california/sportsclubsanfrancisco' },

    // Chicago
    'chicago-lincolnpark': { id: 401, name: 'Equinox Lincoln Park', clubUrl: 'https://www.equinox.com/clubs/chicago/lincolnpark' },

    // Miami
    'miami-brickell': { id: 304, name: 'Equinox Brickell', clubUrl: 'https://www.equinox.com/clubs/florida/brickell' }
  };

  // Default facility IDs to scrape when no specific location is provided
  private readonly defaultFacilityIds = [
    860,  // Vancouver
    138,  // NYC Hudson Yards
    113,  // NYC Columbus Circle
    713,  // LA Sports Club
    724,  // SF Sports Club
    401,  // Chicago Lincoln Park
    304   // Miami Brickell
  ];

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting Equinox API scrape');

    // Determine which facilities to scrape
    let facilityIdsToScrape: number[];
    let locationNames: Map<number, { name: string; clubUrl: string }> = new Map();

    if (options.location) {
      // Scrape specific location
      const location = options.location.toLowerCase();
      const facility = this.facilityMap[location];

      if (!facility) {
        const errorMsg = `Unknown Equinox location: ${options.location}. Available: ${Object.keys(this.facilityMap).join(', ')}`;
        this.logError(errorMsg);
        errors.push(errorMsg);
        return this.createScrapeResult(classes, false, errors);
      }

      facilityIdsToScrape = [facility.id];
      locationNames.set(facility.id, { name: facility.name, clubUrl: facility.clubUrl });
      this.logProgress(`Scraping specific location: ${facility.name} (ID: ${facility.id})`);
    } else {
      // Scrape all default locations
      facilityIdsToScrape = this.defaultFacilityIds;

      // Build location names map
      for (const [key, facility] of Object.entries(this.facilityMap)) {
        locationNames.set(facility.id, { name: facility.name, clubUrl: facility.clubUrl });
      }

      this.logProgress(`Scraping ${facilityIdsToScrape.length} Equinox locations`);
    }

    // Prepare date range
    const startDate = options.startDate || new Date();
    const endDate = options.endDate || new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000); // Default: 7 days

    const startDateStr = this.formatDate(startDate);
    const endDateStr = this.formatDate(endDate);

    this.logProgress(`Date range: ${startDateStr} to ${endDateStr}`);

    // Create a single page for all API requests
    let page = null;

    try {
      page = await this.chromeManager.newPage();

      // Loop through each facility
      for (const facilityId of facilityIdsToScrape) {
        const location = locationNames.get(facilityId);
        if (!location) {
          this.logError(`No location data for facility ID: ${facilityId}`);
          continue;
        }

        this.logProgress(`\n--- Scraping ${location.name} (ID: ${facilityId}) ---`);

        try {
          // Navigate to the club page first to establish session
          await this.chromeManager.navigateWithRetry(page, location.clubUrl);
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

          this.logProgress(`[${location.name}] API response: ${apiResponse.classes?.length || 0} classes found`);

          // Process classes from API response
          if (apiResponse.classes && Array.isArray(apiResponse.classes)) {
            let locationClassCount = 0;

            for (const classData of apiResponse.classes) {
              try {
                const fitnessClass = this.transformApiClass(classData, facilityId);

                if (fitnessClass && this.validateClass(fitnessClass)) {
                  classes.push(fitnessClass);
                  locationClassCount++;

                  // Check max results limit
                  if (options.maxResults && classes.length >= options.maxResults) {
                    this.logProgress(`Reached max results limit: ${options.maxResults}`);
                    break;
                  }
                }
              } catch (error) {
                const errorMsg = `[${location.name}] Error processing class: ${error}`;
                this.logError(errorMsg);
                errors.push(errorMsg);
              }
            }

            this.logProgress(`[${location.name}] Successfully scraped ${locationClassCount} classes`);
          } else {
            const errorMsg = `[${location.name}] Invalid API response format`;
            this.logError(errorMsg);
            errors.push(errorMsg);
          }

          // Break outer loop if max results reached
          if (options.maxResults && classes.length >= options.maxResults) {
            break;
          }

        } catch (error) {
          const errorMsg = `[${location.name}] Scraping failed: ${error}`;
          this.logError(errorMsg);
          errors.push(errorMsg);
        }
      }

      this.logProgress(`\nEquinox scrape complete. Total: ${classes.length} valid classes from ${facilityIdsToScrape.length} locations`);

    } catch (error) {
      const errorMsg = `Equinox API scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
      return this.createScrapeResult(classes, false, errors);
    } finally {
      if (page) {
        await this.chromeManager.closePage(page);
      }
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

      // Build location data dynamically based on facility ID
      const locationData = this.getLocationData(facilityId, apiClass.studioName);

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
        bookingUrl: classId ? `https://www.equinox.com/groupfitness/${classId}` : locationData.clubUrl,
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
   * Get location data for a facility ID
   */
  private getLocationData(facilityId: number, studioName?: string): any {
    const locationMap: Record<number, any> = {
      860: { // Vancouver
        name: `Equinox West Georgia - ${studioName || 'Main Studio'}`,
        address: '1131 West Georgia Street, Vancouver, BC V6E 2X5',
        lat: 49.2826,
        long: -123.1207,
        clubUrl: 'https://www.equinox.com/clubs/canada/vancouver/westgeorgiast'
      },
      138: { // NYC Hudson Yards
        name: `Equinox Hudson Yards - ${studioName || 'Main Studio'}`,
        address: '32 Hudson Yards, New York, NY 10001',
        lat: 40.7538,
        long: -74.0010,
        clubUrl: 'https://www.equinox.com/clubs/new-york/midtown/hudsonyards'
      },
      113: { // NYC Columbus Circle
        name: `Equinox Columbus Circle - ${studioName || 'Main Studio'}`,
        address: '10 Columbus Circle, New York, NY 10019',
        lat: 40.7681,
        long: -73.9819,
        clubUrl: 'https://www.equinox.com/clubs/new-york/uptown/columbuscircle'
      },
      713: { // LA Sports Club
        name: `Equinox Sports Club LA - ${studioName || 'Main Studio'}`,
        address: '1835 Sepulveda Boulevard, Los Angeles, CA 90025',
        lat: 34.0522,
        long: -118.4437,
        clubUrl: 'https://www.equinox.com/clubs/southern-california/los-angeles/losangeles'
      },
      724: { // SF Sports Club
        name: `Equinox Sports Club SF - ${studioName || 'Main Studio'}`,
        address: '747 Market Street, San Francisco, CA 94103',
        lat: 37.7861,
        long: -122.4047,
        clubUrl: 'https://www.equinox.com/clubs/northern-california/sportsclubsanfrancisco'
      },
      401: { // Chicago Lincoln Park
        name: `Equinox Lincoln Park - ${studioName || 'Main Studio'}`,
        address: '1750 North Clark Street, Chicago, IL 60614',
        lat: 41.9139,
        long: -87.6340,
        clubUrl: 'https://www.equinox.com/clubs/chicago/lincolnpark'
      },
      304: { // Miami Brickell
        name: `Equinox Brickell - ${studioName || 'Main Studio'}`,
        address: '1441 Brickell Avenue, Miami, FL 33131',
        lat: 25.7617,
        long: -80.1918,
        clubUrl: 'https://www.equinox.com/clubs/florida/brickell'
      }
    };

    return locationMap[facilityId] || {
      name: `Equinox - ${studioName || 'Main Studio'}`,
      address: 'Equinox Location',
      lat: 0,
      long: 0,
      clubUrl: 'https://www.equinox.com'
    };
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
