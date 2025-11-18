import { FitnessClass } from '../models/FitnessClass.js';
import { logger } from '../utils/logger.js';

export interface BackendConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  batchSize?: number;
}

export interface UploadResult {
  success: boolean;
  uploaded: number;
  failed: number;
  errors: string[];
}

export class BackendClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;
  private batchSize: number;

  constructor(config: BackendConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
    this.batchSize = config.batchSize ?? 50;
  }

  /**
   * Upload fitness classes to the backend API
   */
  async uploadClasses(classes: FitnessClass[]): Promise<UploadResult> {
    const result: UploadResult = {
      success: true,
      uploaded: 0,
      failed: 0,
      errors: []
    };

    if (classes.length === 0) {
      logger.warn('No classes to upload');
      return result;
    }

    logger.info(`Uploading ${classes.length} classes to backend in batches of ${this.batchSize}`);

    // Process in batches
    for (let i = 0; i < classes.length; i += this.batchSize) {
      const batch = classes.slice(i, i + this.batchSize);
      const batchNum = Math.floor(i / this.batchSize) + 1;
      const totalBatches = Math.ceil(classes.length / this.batchSize);

      logger.info(`Processing batch ${batchNum}/${totalBatches} (${batch.length} classes)`);

      try {
        const batchResult = await this.uploadBatch(batch);
        result.uploaded += batchResult.uploaded;
        result.failed += batchResult.failed;
        result.errors.push(...batchResult.errors);

        if (!batchResult.success) {
          result.success = false;
        }

        // Add delay between batches to avoid overwhelming the backend
        if (i + this.batchSize < classes.length) {
          await this.delay(1000);
        }
      } catch (error) {
        const errorMsg = `Batch ${batchNum} failed: ${error}`;
        logger.error(errorMsg);
        result.errors.push(errorMsg);
        result.failed += batch.length;
        result.success = false;
      }
    }

    logger.info(`Upload complete. Uploaded: ${result.uploaded}, Failed: ${result.failed}`);
    return result;
  }

  /**
   * Upload a single batch of classes
   */
  private async uploadBatch(classes: FitnessClass[]): Promise<UploadResult> {
    const result: UploadResult = {
      success: true,
      uploaded: 0,
      failed: 0,
      errors: []
    };

    const url = `${this.baseUrl}/api/v1/classes`;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ classes }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const responseData = await response.json() as any;

      // Assume backend returns { success: true, uploaded: number }
      result.uploaded = responseData.uploaded ?? classes.length;
      logger.info(`Batch uploaded successfully: ${result.uploaded} classes`);

    } catch (error) {
      const errorMsg = `Upload batch failed: ${error}`;
      logger.error(errorMsg);
      result.success = false;
      result.failed = classes.length;
      result.errors.push(errorMsg);
    }

    return result;
  }

  /**
   * Upload a single class (for individual uploads)
   */
  async uploadClass(fitnessClass: FitnessClass): Promise<boolean> {
    const result = await this.uploadClasses([fitnessClass]);
    return result.success && result.uploaded === 1;
  }

  /**
   * Test connection to the backend API
   */
  async testConnection(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/api/v1/health`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        logger.info('Backend connection test successful');
        return true;
      } else {
        logger.warn(`Backend connection test failed: HTTP ${response.status}`);
        return false;
      }
    } catch (error) {
      logger.error('Backend connection test failed:', error);
      return false;
    }
  }

  /**
   * Get backend API statistics
   */
  async getStats(): Promise<any> {
    try {
      const url = `${this.baseUrl}/api/v1/stats`;
      const headers: Record<string, string> = {};

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('Failed to get backend stats:', error);
      return null;
    }
  }

  /**
   * Check if a class already exists in the backend (to avoid duplicates)
   */
  async classExists(providerId: string, datetime: Date): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/api/v1/classes/check`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          providerId,
          datetime: datetime.toISOString()
        })
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as any;
      return data.exists === true;
    } catch (error) {
      logger.error('Error checking class existence:', error);
      return false;
    }
  }

  /**
   * Delay helper function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Set API key (useful for dynamic configuration)
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Get current configuration
   */
  getConfig(): BackendConfig {
    return {
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      timeout: this.timeout,
      batchSize: this.batchSize
    };
  }
}
