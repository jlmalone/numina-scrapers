import { FitnessClass, ScrapeOptions, ScrapeResult } from '../models/FitnessClass.js';
import { ChromeManager } from '../core/ChromeManager.js';
import { logger } from '../utils/logger.js';
import { validateFitnessClass } from '../utils/validation.js';

export interface ProviderConfig {
  enabled: boolean;
  baseUrl: string;
  defaultLocation?: string;
  rateLimit?: number; // Requests per minute
}

export abstract class BaseProvider {
  abstract readonly name: string;
  protected chromeManager: ChromeManager;
  protected config: ProviderConfig;

  constructor(chromeManager: ChromeManager, config: ProviderConfig) {
    this.chromeManager = chromeManager;
    this.config = config;
  }

  /**
   * Main method to scrape classes - must be implemented by each provider
   */
  abstract scrapeClasses(options: ScrapeOptions): Promise<ScrapeResult>;

  /**
   * Validate scraped class data
   */
  validateClass(classData: any): boolean {
    return validateFitnessClass(classData);
  }

  /**
   * Check if provider is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get provider name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get provider configuration
   */
  getConfig(): ProviderConfig {
    return this.config;
  }

  /**
   * Helper method to handle rate limiting
   */
  protected async respectRateLimit(): Promise<void> {
    if (this.config.rateLimit) {
      const delayMs = (60 * 1000) / this.config.rateLimit;
      await this.delay(delayMs);
    }
  }

  /**
   * Helper method to create a scrape result
   */
  protected createScrapeResult(
    classes: FitnessClass[],
    success: boolean = true,
    errors: string[] = []
  ): ScrapeResult {
    return {
      provider: this.name,
      success,
      classesFound: classes.length,
      classes,
      errors,
      timestamp: new Date()
    };
  }

  /**
   * Helper method to log scraping progress
   */
  protected logProgress(message: string, data?: any): void {
    logger.info(`[${this.name}] ${message}`, data);
  }

  /**
   * Helper method to log errors
   */
  protected logError(message: string, error?: any): void {
    logger.error(`[${this.name}] ${message}`, error);
  }

  /**
   * Helper method to create delay
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Parse date and time from various formats
   */
  protected parseDateTime(dateStr: string, timeStr?: string): Date | null {
    try {
      if (timeStr) {
        // Combine date and time strings
        const combined = `${dateStr} ${timeStr}`;
        const date = new Date(combined);
        return isNaN(date.getTime()) ? null : date;
      } else {
        // Parse date string directly
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
      }
    } catch (error) {
      this.logError(`Error parsing date: ${dateStr} ${timeStr}`, error);
      return null;
    }
  }

  /**
   * Extract price from text (e.g., "$25.00" -> 25.00)
   */
  protected parsePrice(priceText: string): number {
    try {
      // Remove currency symbols and parse
      const cleaned = priceText.replace(/[$£€,]/g, '').trim();
      const price = parseFloat(cleaned);
      return isNaN(price) ? 0 : price;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Extract capacity from text (e.g., "15/20" -> 20)
   */
  protected parseCapacity(capacityText: string): number {
    try {
      // Look for patterns like "15/20" or "Capacity: 20"
      const match = capacityText.match(/(\d+)\s*\/\s*(\d+)|capacity:\s*(\d+)/i);
      if (match) {
        // If format is "15/20", take the second number (total capacity)
        return parseInt(match[2] || match[3]);
      }
      // Otherwise try to parse the whole string as a number
      const capacity = parseInt(capacityText.replace(/\D/g, ''));
      return isNaN(capacity) ? 0 : capacity;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Normalize URL (ensure it's absolute)
   */
  protected normalizeUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('/')) {
      return `${this.config.baseUrl}${url}`;
    }
    return `${this.config.baseUrl}/${url}`;
  }

  /**
   * Check if scraped data is within the desired date range
   */
  protected isWithinDateRange(classDate: Date, options: ScrapeOptions): boolean {
    if (options.startDate && classDate < options.startDate) {
      return false;
    }
    if (options.endDate && classDate > options.endDate) {
      return false;
    }
    return true;
  }

  /**
   * Filter and validate scraped classes
   */
  protected filterAndValidate(classes: FitnessClass[], options: ScrapeOptions): FitnessClass[] {
    let filtered = classes;

    // Filter by date range
    if (options.startDate || options.endDate) {
      filtered = filtered.filter(c => this.isWithinDateRange(c.datetime, options));
    }

    // Validate all classes
    filtered = filtered.filter(c => {
      if (!this.validateClass(c)) {
        this.logError(`Invalid class data: ${c.name}`);
        return false;
      }
      return true;
    });

    // Limit results if specified
    if (options.maxResults && filtered.length > options.maxResults) {
      filtered = filtered.slice(0, options.maxResults);
    }

    return filtered;
  }
}

export interface ProviderAdapter {
  name: string;
  scrapeClasses(options: ScrapeOptions): Promise<FitnessClass[]>;
  validateClass(classData: any): boolean;
}
