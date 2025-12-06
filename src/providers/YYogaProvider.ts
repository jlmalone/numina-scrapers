import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for yYoga (Vancouver)
 * Uses Mariana Tek API discovered through browser automation
 */
export class YYogaProvider extends BaseProvider {
  readonly name = 'yyoga';

  // Known yYoga location IDs from Mariana Tek API
  private readonly locationIds = [
    { id: '48717', name: 'Downtown Flow', slug: 'downtown-flow' },
    { id: '48718', name: 'Kitsilano', slug: 'kitsilano' },
    { id: '48750', name: 'West Point Grey', slug: 'west-point-grey' },
    { id: '48719', name: 'Northshore Elements', slug: 'northshore-elements' },
    { id: '48720', name: 'Richmond Olympic Oval', slug: 'richmond-olympic-oval' },
  ];

  private readonly regionId = '48541'; // BC region

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting yYoga scraper with Mariana Tek API');

    let page = null;

    try {
      page = await this.chromeManager.newPage();

      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];

      // Loop through all locations
      for (const location of this.locationIds) {
        try {
          this.logProgress(`Fetching classes for ${location.name}`);

          // Build API URL
          const apiUrl = `https://yyoga.marianatek.com/api/customer/v1/classes?` +
            `min_start_date=${today}&` +
            `max_start_date=${today}&` +
            `page_size=500&` +
            `location=${location.id}&` +
            `region=${this.regionId}`;

          this.logProgress(`API URL: ${apiUrl}`);

          // Navigate to yYoga site first to establish cookies
          if (classes.length === 0) {
            await this.chromeManager.navigateWithRetry(page, 'https://yyoga.ca/book-a-class/');
            await this.delay(3000);
          }

          // Make API request using page.evaluate to use browser context
          const response = await page.evaluate(async (url) => {
            const res = await fetch(url);
            return {
              status: res.status,
              data: await res.json()
            };
          }, apiUrl);

          if (response.status !== 200) {
            throw new Error(`API returned status ${response.status}`);
          }

          const data = response.data;

          if (!data.results || !Array.isArray(data.results)) {
            this.logProgress(`[${location.name}] No classes found`);
            continue;
          }

          this.logProgress(`[${location.name}] Found ${data.results.length} classes`);

          // Transform each class
          for (const classData of data.results) {
            try {
              const fitnessClass = this.transformApiClass(classData, location);
              if (fitnessClass && this.validateClass(fitnessClass)) {
                classes.push(fitnessClass);
              }
            } catch (error) {
              this.logError(`Error transforming class: ${error}`);
            }
          }

          if (options.maxResults && classes.length >= options.maxResults) {
            break;
          }

        } catch (error) {
          const errorMsg = `Error fetching ${location.name}: ${error}`;
          this.logError(errorMsg);
          errors.push(errorMsg);
        }
      }

      this.logProgress(`yYoga scrape complete. Total: ${classes.length} classes`);

    } catch (error) {
      const errorMsg = `yYoga scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
    } finally {
      if (page) {
        await this.chromeManager.closePage(page);
      }
    }

    return this.createScrapeResult(classes, classes.length > 0, errors);
  }

  /**
   * Transform API response to FitnessClass format
   */
  private transformApiClass(data: any, locationInfo: any): FitnessClass | null {
    try {
      // Extract class name
      const className = sanitizeString(data.name || data.class_type?.name || 'Yoga Class');

      // Parse start datetime
      const startDate = new Date(data.start_datetime);
      if (isNaN(startDate.getTime())) {
        throw new Error('Invalid start_datetime');
      }

      // Extract instructor name and full info
      let instructorName = 'Staff';
      let trainerInfo = undefined;

      if (data.instructors && data.instructors.length > 0) {
        const instructor = data.instructors[0];
        instructorName = sanitizeString(instructor.name);

        // Build comprehensive trainer info
        trainerInfo = {
          name: instructorName,
          bio: instructor.bio ? sanitizeString(instructor.bio) : undefined,
          photoUrl: instructor.photo_urls?.large_url || instructor.photo_urls?.thumbnail_url,
          socialLinks: {
            instagram: instructor.instagram_url || undefined
          }
        };
      }

      // Extract location details
      const locationData = data.location || {};
      const locationName = sanitizeString(locationData.name || locationInfo.name);
      const address = this.formatAddress(locationData);
      const lat = parseFloat(locationData.latitude) || 0;
      const long = parseFloat(locationData.longitude) || 0;

      // Extract description
      const description = sanitizeString(
        data.class_type?.description ||
        `${className} at ${locationName}`
      );

      // Build booking URL
      const bookingUrl = `https://yyoga.ca/book-a-class/?studio=${locationInfo.slug}`;

      // Extract capacity info
      const capacity = data.capacity || 30;
      const availableSpots = data.available_spot_count || 0;

      // Determine intensity based on class name
      let intensity = 4; // Default for yoga
      const lowerName = className.toLowerCase();
      if (lowerName.includes('power') || lowerName.includes('hot') || lowerName.includes('sculpt')) {
        intensity = 7;
      } else if (lowerName.includes('flow')) {
        intensity = 5;
      } else if (lowerName.includes('yin') || lowerName.includes('restor')) {
        intensity = 2;
      }

      // Extract tags
      const tags = ['yoga', sanitizeString(className)];
      if (data.class_tags && Array.isArray(data.class_tags)) {
        data.class_tags.forEach((tag: any) => {
          if (tag.name) {
            tags.push(sanitizeString(tag.name));
          }
        });
      }

      // Extract room name
      const roomName = data.classroom_name || null;
      if (roomName) {
        tags.push(`room-${sanitizeString(roomName).toLowerCase()}`);
      }

      const fitnessClass: FitnessClass = {
        name: className,
        description: description,
        datetime: startDate,
        location: {
          name: locationName,
          address: address,
          lat: lat,
          long: long
        },
        trainer: instructorName,
        trainerInfo: trainerInfo, // Enhanced trainer details with bio and photo
        intensity: intensity,
        price: 0, // Pricing varies by membership
        bookingUrl: bookingUrl,
        providerId: `yyoga-${data.id}`,
        providerName: this.name,
        capacity: capacity,
        spotsAvailable: availableSpots,
        tags: tags,
        amenities: [
          { type: 'locker', available: true },
          { type: 'shower', available: true },
          { type: 'mat', available: true },
          { type: 'towel', available: true }
        ],
        pricingDetails: {
          dropIn: { amount: 28, currency: 'CAD' },
          classPass: { amount: 22, currency: 'CAD' }
        },
        notes: roomName ? `Room: ${roomName}` : undefined
      };

      return fitnessClass;

    } catch (error) {
      this.logError(`Error transforming class: ${error}`);
      return null;
    }
  }

  /**
   * Format address from location data
   */
  private formatAddress(locationData: any): string {
    if (!locationData) return '';

    const parts = [];

    if (locationData.address_line_one) {
      parts.push(locationData.address_line_one);
    }

    const cityLine = [
      locationData.city,
      locationData.state_province,
      locationData.postal_code
    ].filter(Boolean).join(' ');

    if (cityLine) {
      parts.push(cityLine);
    }

    return parts.join(', ');
  }
}
