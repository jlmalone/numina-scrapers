import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { parseIntensity, parseTags, sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for 24 Hour Fitness
 * 24 Hour Fitness is a large national gym chain offering group fitness classes
 *
 * Website uses heavy JavaScript, so we need proper wait strategies
 */
export class TwentyFourHourFitnessProvider extends BaseProvider {
  readonly name = '24hourfitness';

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting 24 Hour Fitness scrape');

    const page = await this.chromeManager.newPage();

    try {
      // Step 1: Navigate to gym finder page
      const location = options.location || this.config.defaultLocation || 'New York, NY';
      const gymFinderUrl = `${this.config.baseUrl}/gyms/find-a-gym/`;

      await this.chromeManager.navigateWithRetry(page, gymFinderUrl);
      this.logProgress(`Navigated to gym finder page`);

      // Wait for page to be fully loaded (JavaScript-heavy site)
      await this.delay(3000);

      // Step 2: Search for location
      this.logProgress(`Searching for location: ${location}`);

      try {
        // Wait for the search input to appear
        await page.waitForSelector('input[type="text"], input[placeholder*="location"], input[placeholder*="zip"], input.search-input, input#location', { timeout: 10000 });

        // Try multiple common input selectors
        const inputSelectors = [
          'input[placeholder*="location" i]',
          'input[placeholder*="zip" i]',
          'input[placeholder*="city" i]',
          'input.search-input',
          'input#location',
          'input#search',
          'input[type="text"]'
        ];

        let inputFound = false;
        for (const selector of inputSelectors) {
          try {
            const input = await page.$(selector);
            if (input) {
              await input.click();
              await this.delay(500);
              await input.type(location, { delay: 100 });
              inputFound = true;
              this.logProgress(`Entered location using selector: ${selector}`);
              break;
            }
          } catch (e) {
            // Try next selector
          }
        }

        if (!inputFound) {
          throw new Error('Could not find location search input');
        }

        // Wait for search to process
        await this.delay(1500);

        // Submit search - try button click or Enter key
        const submitSelectors = [
          'button[type="submit"]',
          'button.search-button',
          'button.submit',
          'button:has-text("Search")',
          'button:has-text("Find")'
        ];

        let submitted = false;
        for (const selector of submitSelectors) {
          try {
            const button = await page.$(selector);
            if (button) {
              await button.click();
              submitted = true;
              this.logProgress(`Submitted search using: ${selector}`);
              break;
            }
          } catch (e) {
            // Try next selector
          }
        }

        if (!submitted) {
          // Fallback: press Enter
          await page.keyboard.press('Enter');
          this.logProgress('Submitted search using Enter key');
        }

        // Wait for gym results to load
        await this.delay(3000);

      } catch (error) {
        this.logError('Error searching for location', error);
        errors.push(`Location search failed: ${error}`);
      }

      // Step 3: Get gym URLs from search results
      const gymUrls = await this.extractGymUrls(page);

      if (gymUrls.length === 0) {
        this.logError('No gyms found for location');
        errors.push('No gyms found');
        return this.createScrapeResult(classes, false, errors);
      }

      this.logProgress(`Found ${gymUrls.length} gyms to scrape`);

      // Step 4: Visit each gym and scrape classes
      for (let i = 0; i < gymUrls.length; i++) {
        const gymUrl = gymUrls[i];

        // Limit number of gyms to scrape
        if (options.maxResults && classes.length >= options.maxResults) {
          this.logProgress('Reached max results limit');
          break;
        }

        try {
          this.logProgress(`Scraping gym ${i + 1}/${gymUrls.length}: ${gymUrl}`);

          // Navigate to gym page
          await this.chromeManager.navigateWithRetry(page, gymUrl);
          await this.delay(2000);

          // Try to find and navigate to class schedule
          const scheduleUrl = await this.findScheduleUrl(page, gymUrl);

          if (scheduleUrl) {
            await this.chromeManager.navigateWithRetry(page, scheduleUrl);
            await this.delay(2000);

            // Extract classes from schedule page
            const gymClasses = await this.extractClassesFromSchedule(page, gymUrl);

            for (const fitnessClass of gymClasses) {
              // Filter by date range
              if (this.isWithinDateRange(fitnessClass.datetime, options)) {
                if (this.validateClass(fitnessClass)) {
                  classes.push(fitnessClass);
                  this.logProgress(`Scraped: ${fitnessClass.name} on ${fitnessClass.datetime.toLocaleString()}`);

                  // Check max results
                  if (options.maxResults && classes.length >= options.maxResults) {
                    break;
                  }
                }
              }
            }
          } else {
            this.logError(`Could not find schedule page for gym: ${gymUrl}`);
          }

          // Respect rate limits between gyms
          await this.respectRateLimit();

        } catch (error) {
          const errorMsg = `Error scraping gym ${gymUrl}: ${error}`;
          this.logError(errorMsg);
          errors.push(errorMsg);
        }
      }

      this.logProgress(`24 Hour Fitness scrape complete. Found ${classes.length} classes`);

    } catch (error) {
      const errorMsg = `24 Hour Fitness scraping failed: ${error}`;
      this.logError(errorMsg);
      errors.push(errorMsg);
      return this.createScrapeResult(classes, false, errors);

    } finally {
      await this.chromeManager.closePage(page);
    }

    return this.createScrapeResult(classes, true, errors);
  }

  /**
   * Extract gym URLs from search results
   */
  private async extractGymUrls(page: any): Promise<string[]> {
    try {
      // Wait for gym listings to appear
      const listingSelectors = [
        '.gym-card',
        '.location-card',
        '.club-card',
        '[data-gym]',
        'a[href*="/gyms/"]'
      ];

      let selectorFound = false;
      for (const selector of listingSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          selectorFound = true;
          break;
        } catch (e) {
          // Try next selector
        }
      }

      if (!selectorFound) {
        this.logError('Could not find gym listing elements');
        return [];
      }

      // Extract gym URLs
      const urls = await page.evaluate(() => {
        const links: string[] = [];

        // Try different selectors for gym links
        const selectors = [
          'a[href*="/gyms/"][href*="/gym/"]',
          '.gym-card a',
          '.location-card a',
          '.club-card a',
          'a.view-club',
          'a.gym-link'
        ];

        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const href = (el as HTMLAnchorElement).href;
            if (href && href.includes('/gyms/') && !links.includes(href)) {
              links.push(href);
            }
          }
          if (links.length > 0) break;
        }

        return links;
      });

      return urls;

    } catch (error) {
      this.logError('Error extracting gym URLs', error);
      return [];
    }
  }

  /**
   * Find the schedule URL for a gym - handles the "CLASS SCHEDULE" button click issue
   */
  private async findScheduleUrl(page: any, currentUrl: string): Promise<string | null> {
    try {
      // Strategy 1: Look for direct schedule link in navigation
      const scheduleLink = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        for (const link of links) {
          const text = link.textContent?.toLowerCase() || '';
          const href = (link as HTMLAnchorElement).href;
          if ((text.includes('schedule') || text.includes('classes')) && href) {
            return href;
          }
        }
        return null;
      });

      if (scheduleLink) {
        this.logProgress('Found schedule link in navigation');
        return scheduleLink;
      }

      // Strategy 2: Try to construct schedule URL from gym URL
      // URLs typically follow pattern: /gyms/[location]/[gym-name]/schedule
      if (currentUrl.includes('/gyms/')) {
        const scheduleUrl = currentUrl.replace(/\/$/, '') + '/schedule';
        this.logProgress(`Trying constructed schedule URL: ${scheduleUrl}`);
        return scheduleUrl;
      }

      // Strategy 3: Try clicking schedule button with multiple strategies
      const buttonSelectors = [
        'button:has-text("CLASS SCHEDULE")',
        'a:has-text("CLASS SCHEDULE")',
        'button:has-text("Schedule")',
        'a:has-text("Schedule")',
        '.class-schedule-button',
        'button.schedule',
        'a.schedule',
        '[data-schedule]'
      ];

      for (const selector of buttonSelectors) {
        try {
          // Wait for button with shorter timeout
          await page.waitForSelector(selector, { timeout: 3000 });

          // Try clicking the button
          await page.click(selector);
          await this.delay(2000);

          // Check if URL changed (navigation occurred)
          const newUrl = page.url();
          if (newUrl !== currentUrl && newUrl.includes('schedule')) {
            this.logProgress(`Successfully clicked schedule button: ${selector}`);
            return newUrl;
          }
        } catch (e) {
          // Button not found or click failed, try next selector
        }
      }

      // Strategy 4: Use page.evaluate to find and click button (bypasses Puppeteer's visibility checks)
      const clickResult = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        for (const btn of buttons) {
          const text = btn.textContent?.trim().toUpperCase() || '';
          if (text.includes('CLASS SCHEDULE') || text === 'SCHEDULE') {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (clickResult) {
        await this.delay(2000);
        const newUrl = page.url();
        if (newUrl !== currentUrl) {
          this.logProgress('Successfully clicked schedule button via page.evaluate');
          return newUrl;
        }
      }

      this.logError('Could not find or click schedule button');
      return null;

    } catch (error) {
      this.logError('Error finding schedule URL', error);
      return null;
    }
  }

  /**
   * Extract classes from a schedule page
   */
  private async extractClassesFromSchedule(page: any, gymUrl: string): Promise<FitnessClass[]> {
    const classes: FitnessClass[] = [];

    try {
      // Wait for schedule content to load
      const scheduleSelectors = [
        '.class-schedule',
        '.schedule-container',
        '.class-list',
        '[data-schedule]',
        '.fitness-classes'
      ];

      let scheduleFound = false;
      for (const selector of scheduleSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          scheduleFound = true;
          break;
        } catch (e) {
          // Try next selector
        }
      }

      if (!scheduleFound) {
        this.logError('Schedule content not found on page');
        return classes;
      }

      // Get gym location info from page
      const gymInfo = await page.evaluate(() => {
        const getName = (selectors: string[]): string => {
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el?.textContent) return el.textContent.trim();
          }
          return '';
        };

        const getAddress = (selectors: string[]): string => {
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el?.textContent) return el.textContent.trim();
          }
          return '';
        };

        return {
          name: getName(['.gym-name', '.club-name', 'h1', '.location-name']),
          address: getAddress(['.gym-address', '.club-address', '.address', '[itemprop="address"]'])
        };
      });

      // Geocode gym location
      const locationName = gymInfo.name || '24 Hour Fitness';
      const address = gymInfo.address || locationName;
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

      // Extract class cards
      const classCards = await page.$$('.class-card, .class-item, .schedule-item, [data-class]');
      this.logProgress(`Found ${classCards.length} class cards on schedule page`);

      for (let i = 0; i < classCards.length; i++) {
        try {
          const classInfo = await page.evaluate((card) => {
            const getText = (selectors: string[]): string => {
              for (const selector of selectors) {
                const el = card.querySelector(selector);
                if (el?.textContent) return el.textContent.trim();
              }
              return '';
            };

            const getAttr = (selectors: string[], attr: string): string => {
              for (const selector of selectors) {
                const el = card.querySelector(selector);
                const value = el?.getAttribute(attr);
                if (value) return value;
              }
              return '';
            };

            return {
              name: getText(['.class-name', '.class-title', 'h3', 'h4', '.title']),
              instructor: getText(['.instructor', '.teacher', '.trainer', '[data-instructor]']),
              time: getText(['.class-time', '.time', '.start-time']),
              date: getText(['.class-date', '.date']) || getAttr(['[data-date]'], 'data-date'),
              duration: getText(['.duration', '.class-duration', '.length']),
              description: getText(['.description', '.class-description', 'p']),
              level: getText(['.level', '.intensity', '.difficulty']),
              spotsAvailable: getText(['.spots', '.availability', '.capacity']),
              bookingLink: getAttr(['a.book', 'a.reserve', 'a.sign-up'], 'href'),
              classType: getText(['.type', '.category', '.class-type'])
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

          // Parse intensity
          const className = classInfo.name.toLowerCase();
          let intensity = 5;
          if (className.includes('spin') || className.includes('cycle') || className.includes('hiit') || className.includes('bootcamp')) {
            intensity = 8;
          } else if (className.includes('yoga') || className.includes('pilates') || className.includes('stretch')) {
            intensity = 4;
          } else if (className.includes('zumba') || className.includes('dance')) {
            intensity = 6;
          } else if (classInfo.level) {
            intensity = parseIntensity(classInfo.level);
          }

          // Parse capacity
          const capacity = this.parseCapacity(classInfo.spotsAvailable) || 25;

          // 24 Hour Fitness classes are typically free for members
          const price = 0;

          // Create fitness class object
          const fitnessClass: FitnessClass = {
            name: sanitizeString(classInfo.name),
            description: sanitizeString(classInfo.description) || 'Group fitness class',
            datetime,
            location: locationData,
            trainer: sanitizeString(classInfo.instructor) || 'Instructor',
            intensity,
            price,
            bookingUrl: this.normalizeUrl(classInfo.bookingLink) || gymUrl,
            providerId: `24hourfitness-${datetime.getTime()}-${classInfo.name}-${locationName}`,
            providerName: this.name,
            capacity,
            tags: parseTags('group fitness ' + classInfo.name + ' ' + classInfo.description + ' ' + classInfo.classType)
          };

          classes.push(fitnessClass);

        } catch (error) {
          this.logError(`Error processing class card ${i}`, error);
        }
      }

    } catch (error) {
      this.logError('Error extracting classes from schedule', error);
    }

    return classes;
  }
}
