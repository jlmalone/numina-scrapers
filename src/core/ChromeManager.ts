import puppeteer, { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer';
import { logger } from '../utils/logger.js';

export interface ChromeOptions {
  headless?: boolean;
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
  };
  timeout?: number;
}

export class ChromeManager {
  private browser: Browser | null = null;
  private pages: Page[] = [];
  private options: ChromeOptions;

  constructor(options: ChromeOptions = {}) {
    this.options = {
      headless: options.headless ?? true,
      userAgent: options.userAgent ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      viewport: options.viewport ?? { width: 1920, height: 1080 },
      timeout: options.timeout ?? 30000
    };
  }

  async initialize(): Promise<void> {
    if (this.browser) {
      logger.warn('Browser already initialized');
      return;
    }

    const launchOptions: PuppeteerLaunchOptions = {
      headless: this.options.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    };

    try {
      this.browser = await puppeteer.launch(launchOptions);
      logger.info('Chrome browser launched successfully');
    } catch (error) {
      logger.error('Failed to launch Chrome browser:', error);
      throw error;
    }
  }

  async newPage(): Promise<Page> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();

    // Set user agent
    if (this.options.userAgent) {
      await page.setUserAgent(this.options.userAgent);
    }

    // Set viewport
    if (this.options.viewport) {
      await page.setViewport(this.options.viewport);
    }

    // Set default timeout
    page.setDefaultTimeout(this.options.timeout!);

    // Enable request interception for blocking unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      // Block images, fonts, and media to speed up scraping
      if (['image', 'font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    this.pages.push(page);
    logger.info(`New page created. Total pages: ${this.pages.length}`);

    return page;
  }

  async closePage(page: Page): Promise<void> {
    try {
      await page.close();
      this.pages = this.pages.filter(p => p !== page);
      logger.info(`Page closed. Remaining pages: ${this.pages.length}`);
    } catch (error) {
      logger.error('Error closing page:', error);
    }
  }

  async close(): Promise<void> {
    if (!this.browser) {
      return;
    }

    try {
      // Close all pages first
      for (const page of this.pages) {
        await page.close();
      }
      this.pages = [];

      // Close browser
      await this.browser.close();
      this.browser = null;
      logger.info('Chrome browser closed successfully');
    } catch (error) {
      logger.error('Error closing Chrome browser:', error);
    }
  }

  isInitialized(): boolean {
    return this.browser !== null;
  }

  getPageCount(): number {
    return this.pages.length;
  }

  /**
   * Navigate to a URL with retry logic
   */
  async navigateWithRetry(page: Page, url: string, maxRetries: number = 3): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Navigating to ${url} (attempt ${attempt}/${maxRetries})`);
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: this.options.timeout
        });
        logger.info(`Successfully navigated to ${url}`);
        return;
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Navigation attempt ${attempt} failed:`, error);

        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          logger.info(`Retrying in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }

    throw new Error(`Failed to navigate to ${url} after ${maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Wait for a selector with custom timeout
   */
  async waitForSelector(page: Page, selector: string, timeout?: number): Promise<void> {
    try {
      await page.waitForSelector(selector, { timeout: timeout ?? this.options.timeout });
    } catch (error) {
      logger.error(`Timeout waiting for selector: ${selector}`);
      throw error;
    }
  }

  /**
   * Extract text content from elements
   */
  async extractText(page: Page, selector: string): Promise<string[]> {
    try {
      const elements = await page.$$(selector);
      const texts: string[] = [];

      for (const element of elements) {
        const text = await element.evaluate(el => el.textContent?.trim() || '');
        if (text) {
          texts.push(text);
        }
      }

      return texts;
    } catch (error) {
      logger.error(`Error extracting text from selector: ${selector}`, error);
      return [];
    }
  }

  /**
   * Extract attribute values from elements
   */
  async extractAttribute(page: Page, selector: string, attribute: string): Promise<string[]> {
    try {
      const elements = await page.$$(selector);
      const values: string[] = [];

      for (const element of elements) {
        const value = await element.evaluate((el, attr) => el.getAttribute(attr) || '', attribute);
        if (value) {
          values.push(value);
        }
      }

      return values;
    } catch (error) {
      logger.error(`Error extracting attribute ${attribute} from selector: ${selector}`, error);
      return [];
    }
  }

  /**
   * Take a screenshot (useful for debugging)
   */
  async screenshot(page: Page, filepath: string): Promise<void> {
    try {
      await page.screenshot({ path: filepath, fullPage: true });
      logger.info(`Screenshot saved to ${filepath}`);
    } catch (error) {
      logger.error(`Error taking screenshot:`, error);
    }
  }

  /**
   * Delay helper function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Random delay to mimic human behavior
   */
  async randomDelay(min: number = 1000, max: number = 3000): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await this.delay(delay);
  }
}
