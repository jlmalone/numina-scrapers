import { BaseProvider, ProviderConfig } from './BaseProvider.js';
import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { sanitizeString } from '../utils/validation.js';

/**
 * Provider adapter for Good Yoga San Diego
 * Uses Mindbody/HealCode widget with DOM extraction
 *
 * Discovered configuration:
 * - Site ID: 116373
 * - Mindbody Site ID: 5734496
 * - Widget ID: 212051
 */
export class GoodYogaProvider extends BaseProvider {
  readonly name = 'goodyoga';

  private readonly siteUrl = 'https://goodyogasandiego.com/';
  private readonly widgetId = '212051';
  private readonly locationName = 'Good Yoga San Diego';
  private readonly locationAddress = '4302 Cass St, San Diego, CA 92109';
  private readonly locationLat = 32.7981;
  private readonly locationLong = -117.2522;

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    super(chromeManager, config);
  }

  async scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult> {
    const classes: FitnessClass[] = [];
    const errors: string[] = [];

    this.logProgress('Starting Good Yoga San Diego scraper (Mindbody/HealCode)');

    let page = null;

    try {
      page = await this.chromeManager.newPage();

      // Navigate to the site
      this.logProgress('Navigating to Good Yoga San Diego...');
      await this.chromeManager.navigateWithRetry(page, this.siteUrl);

      // Wait for the Mindbody widget to load
      this.logProgress('Waiting for Mindbody schedule widget to load...');
      await page.waitForSelector(`#bw-widget__schedules-${this.widgetId}`, { timeout: 30000 });

      // Give extra time for JavaScript to populate the schedule
      await this.delay(8000);

      // Check if we need to click "Full Calendar" or navigate through dates
      this.logProgress('Extracting class data from widget...');

      // Try multiple date strategies to get more classes
      const datesToScrape = this.getDateRange(7); // Next 7 days

      for (const dateStr of datesToScrape) {
        try {
          this.logProgress(`Fetching classes for ${dateStr}...`);

          // Click on the date in the calendar if not today
          if (dateStr !== this.getTodayString()) {
            const dateClicked = await page.evaluate((date) => {
              const dateSpan = document.querySelector(`span[data-bw-startdate="${date}"]`);
              if (dateSpan && dateSpan.parentElement) {
                (dateSpan.parentElement as HTMLElement).click();
                return true;
              }
              return false;
            }, dateStr);

            if (dateClicked) {
              this.logProgress(`  Clicked on date ${dateStr}, waiting for reload...`);
              await this.delay(3000);
            }
          }

          // Extract all visible sessions
          const sessionData = await page.evaluate((widgetId) => {
            const sessions: any[] = [];
            const widget = document.querySelector(`#bw-widget__schedules-${widgetId}`);

            if (!widget) return sessions;

            const sessionElements = widget.querySelectorAll('.bw-session');

            sessionElements.forEach((session) => {
              try {
                // Skip empty sessions
                if (session.classList.contains('bw-session--empty')) {
                  return;
                }

                // Extract class name
                const nameEl = session.querySelector('.bw-session__name');
                const name = nameEl ? nameEl.textContent?.trim() : null;

                // Extract datetime from <time> elements
                const startTimeEl = session.querySelector('time.hc_starttime');
                const endTimeEl = session.querySelector('time.hc_endtime');
                const startDatetime = startTimeEl ? startTimeEl.getAttribute('datetime') : null;
                const endDatetime = endTimeEl ? endTimeEl.getAttribute('datetime') : null;

                // Extract instructor
                const staffEl = session.querySelector('.bw-session__staff');
                const staffName = staffEl ? staffEl.textContent?.trim() : null;

                // Extract spots available
                const spotsEl = session.querySelector('.bw-session__availability');
                const spotsText = spotsEl ? spotsEl.textContent?.trim() : null;

                // Extract booking URL from button
                const signUpBtn = session.querySelector('.bw-widget__cta');
                const bookingUrl = signUpBtn ? signUpBtn.getAttribute('data-url') : null;

                // Extract description
                const descEl = session.querySelector('.bw-session__description');
                const description = descEl ? descEl.textContent?.trim() : null;

                if (name && startDatetime) {
                  sessions.push({
                    name,
                    startDatetime,
                    endDatetime,
                    staffName,
                    spotsText,
                    bookingUrl,
                    description
                  });
                }
              } catch (e) {
                console.error('Error extracting session:', e);
              }
            });

            return sessions;
          }, this.widgetId);

          this.logProgress(`  Found ${sessionData.length} sessions for ${dateStr}`);

          // Transform each session to FitnessClass
          for (const session of sessionData) {
            try {
              const fitnessClass = this.transformWidgetSession(session, dateStr);
              if (fitnessClass) {
                if (this.validateClass(fitnessClass)) {
                  classes.push(fitnessClass);
                } else {
                  this.logProgress(`  ⚠️  Validation failed for: ${session.name}`);
                }
              } else {
                this.logProgress(`  ⚠️  Transform returned null for: ${session.name}`);
              }
            } catch (error) {
              this.logError(`Error transforming session "${session.name}": ${error}`);
            }
          }

          if (options.maxResults && classes.length >= options.maxResults) {
            break;
          }

        } catch (error) {
          const errorMsg = `Error fetching ${dateStr}: ${error}`;
          this.logError(errorMsg);
          errors.push(errorMsg);
        }
      }

      this.logProgress(`Good Yoga scrape complete. Total: ${classes.length} classes`);

    } catch (error) {
      const errorMsg = `Good Yoga scraping failed: ${error}`;
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
   * Transform widget session data to FitnessClass format
   */
  private transformWidgetSession(data: any, dateStr: string): FitnessClass | null {
    try {
      const className = sanitizeString(data.name);

      // Parse datetime from ISO format: "2025-11-25T06:00"
      const startDateTime = new Date(data.startDatetime);
      if (isNaN(startDateTime.getTime())) {
        throw new Error(`Invalid start datetime: ${data.startDatetime}`);
      }

      // Parse end datetime if available
      let endDateTime: Date;
      if (data.endDatetime) {
        endDateTime = new Date(data.endDatetime);
        if (isNaN(endDateTime.getTime())) {
          // Fall back to 60 minute duration
          endDateTime = new Date(startDateTime.getTime() + 60 * 60000);
        }
      } else {
        // Default 60 minute duration
        endDateTime = new Date(startDateTime.getTime() + 60 * 60000);
      }

      // Parse spots available
      const capacity = this.parseCapacity(data.spotsText);

      // Instructor name
      const instructorName = data.staffName ? sanitizeString(data.staffName) : 'Staff';

      // Build booking URL - use discovered URL or fall back to Mindbody direct link
      const bookingUrl = data.bookingUrl || `https://cart.mindbodyonline.com/sites/116373/client?widget_type=schedule`;

      // Description
      const description = data.description ? sanitizeString(data.description) : `${className} class at Good Yoga San Diego`;

      // Determine intensity based on class name
      const intensity = this.calculateIntensity(className);

      // Generate unique provider ID
      const providerId = `goodyoga-${startDateTime.getTime()}-${className.replace(/\s+/g, '-').toLowerCase()}`;

      const fitnessClass: FitnessClass = {
        name: className,
        description: description,
        datetime: startDateTime, // Date object, not string
        location: {
          name: this.locationName,
          address: this.locationAddress,
          lat: this.locationLat,
          long: this.locationLong
        },
        trainer: instructorName,
        intensity: intensity,
        price: 0, // Pricing varies by membership
        bookingUrl: bookingUrl,
        providerId: providerId,
        providerName: this.name,
        capacity: capacity.total,
        tags: this.extractTags(className)
      };

      return fitnessClass;

    } catch (error) {
      this.logError(`Error in transformWidgetSession: ${error}`);
      return null;
    }
  }

  /**
   * Parse datetime from date string and time text
   */
  private parseDateTime(dateStr: string, timeText: string): Date | null {
    try {
      // dateStr format: "2025-11-24"
      // timeText format: "10:00 am" or "6:30 pm"

      const timeMatch = timeText.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
      if (!timeMatch) return null;

      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const meridiem = timeMatch[3].toLowerCase();

      // Convert to 24-hour format
      if (meridiem === 'pm' && hours !== 12) {
        hours += 12;
      } else if (meridiem === 'am' && hours === 12) {
        hours = 0;
      }

      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day, hours, minutes, 0);

      return date;
    } catch (error) {
      this.logError(`Error parsing datetime: ${dateStr} ${timeText} - ${error}`);
      return null;
    }
  }

  /**
   * Parse duration from text like "60 min" or "90 min"
   */
  private parseDuration(durationText: string | null): number {
    if (!durationText) return 60; // Default 60 minutes

    const match = durationText.match(/(\d+)\s*min/i);
    return match ? parseInt(match[1]) : 60;
  }

  /**
   * Parse capacity from text like "5 spots left" or "Class Full"
   */
  private parseCapacity(spotsText: string | null): { total: number; available: number } {
    if (!spotsText) {
      return { total: 20, available: 20 }; // Default capacity
    }

    const lowerText = spotsText.toLowerCase();

    if (lowerText.includes('full') || lowerText.includes('sold out')) {
      return { total: 20, available: 0 };
    }

    if (lowerText.includes('unlimited') || lowerText.includes('no limit')) {
      return { total: 999, available: 999 };
    }

    const match = spotsText.match(/(\d+)\s*spot/i);
    if (match) {
      const available = parseInt(match[1]);
      return { total: available + 10, available }; // Estimate total capacity
    }

    return { total: 20, available: 20 };
  }

  /**
   * Extract tags from class name
   */
  private extractTags(className: string): string[] {
    const tags: string[] = ['yoga'];
    const lowerName = className.toLowerCase();

    if (lowerName.includes('vinyasa')) tags.push('vinyasa');
    if (lowerName.includes('hatha')) tags.push('hatha');
    if (lowerName.includes('yin')) tags.push('yin');
    if (lowerName.includes('flow')) tags.push('flow');
    if (lowerName.includes('power')) tags.push('power');
    if (lowerName.includes('restorative')) tags.push('restorative');
    if (lowerName.includes('beginner') || lowerName.includes('basics')) tags.push('beginner-friendly');
    if (lowerName.includes('advanced')) tags.push('advanced');
    if (lowerName.includes('hot')) tags.push('hot');
    if (lowerName.includes('pilates')) {
      tags.push('pilates');
      tags.splice(tags.indexOf('yoga'), 1); // Remove yoga tag if it's pilates
    }

    return tags;
  }

  /**
   * Calculate intensity level (1-10) based on class name
   */
  private calculateIntensity(className: string): number {
    const lowerName = className.toLowerCase();

    // Hot yoga (26+2, hot vinyasa) - high intensity
    if (lowerName.includes('hot')) {
      if (lowerName.includes('26') || lowerName.includes('power')) {
        return 8;
      }
      return 7;
    }

    // Power yoga - high intensity
    if (lowerName.includes('power')) {
      return 8;
    }

    // Vinyasa flow - medium-high intensity
    if (lowerName.includes('vinyasa') || lowerName.includes('flow')) {
      return 6;
    }

    // Yin yoga - low intensity
    if (lowerName.includes('yin') || lowerName.includes('restorative')) {
      return 2;
    }

    // Hatha yoga - medium intensity
    if (lowerName.includes('hatha')) {
      return 4;
    }

    // Default medium intensity for yoga
    return 5;
  }

  /**
   * Get date range for scraping
   */
  private getDateRange(days: number): string[] {
    const dates: string[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }

    return dates;
  }

  /**
   * Get today's date string in YYYY-MM-DD format
   */
  private getTodayString(): string {
    return new Date().toISOString().split('T')[0];
  }
}
