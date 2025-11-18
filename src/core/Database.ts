import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { FitnessClass } from '../models/FitnessClass.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

export interface ScrapeRun {
  id?: number;
  provider: string;
  startTime: string;
  endTime?: string;
  status: 'running' | 'completed' | 'failed';
  classesFound: number;
  classesUploaded: number;
  errors?: string;
}

export interface ScrapedClass extends FitnessClass {
  id?: number;
  scrapeRunId: number;
  uploadedToBackend: boolean;
  createdAt?: string;
}

export interface Provider {
  id?: number;
  name: string;
  enabled: boolean;
  lastScrape?: string;
  totalRuns: number;
  successfulRuns: number;
  totalClassesFound: number;
}

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath || join(projectRoot, 'numina-scrapers.db');
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.initializeSchema();
    logger.info(`Database initialized at ${path}`);
  }

  private initializeSchema(): void {
    // Create providers table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        enabled BOOLEAN DEFAULT 1,
        last_scrape DATETIME,
        total_runs INTEGER DEFAULT 0,
        successful_runs INTEGER DEFAULT 0,
        total_classes_found INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create scrape_runs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scrape_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        start_time DATETIME NOT NULL,
        end_time DATETIME,
        status TEXT CHECK(status IN ('running', 'completed', 'failed')) DEFAULT 'running',
        classes_found INTEGER DEFAULT 0,
        classes_uploaded INTEGER DEFAULT 0,
        errors TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create scraped_classes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scraped_classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scrape_run_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        datetime DATETIME NOT NULL,
        location_name TEXT NOT NULL,
        location_address TEXT NOT NULL,
        location_lat REAL NOT NULL,
        location_long REAL NOT NULL,
        trainer TEXT,
        intensity INTEGER CHECK(intensity BETWEEN 1 AND 10),
        price REAL,
        booking_url TEXT,
        provider_id TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        capacity INTEGER,
        tags TEXT,
        uploaded_to_backend BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        photos TEXT,
        trainer_info TEXT,
        amenities TEXT,
        real_time_availability INTEGER,
        booking_status TEXT CHECK(booking_status IN ('open', 'closed', 'full', 'waitlist')),
        last_availability_check DATETIME,
        pricing_details TEXT,
        reviews TEXT,
        FOREIGN KEY (scrape_run_id) REFERENCES scrape_runs(id)
      )
    `);

    // Create indexes for better query performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_scrape_runs_provider ON scrape_runs(provider);
      CREATE INDEX IF NOT EXISTS idx_scrape_runs_start_time ON scrape_runs(start_time);
      CREATE INDEX IF NOT EXISTS idx_scraped_classes_scrape_run ON scraped_classes(scrape_run_id);
      CREATE INDEX IF NOT EXISTS idx_scraped_classes_datetime ON scraped_classes(datetime);
      CREATE INDEX IF NOT EXISTS idx_scraped_classes_provider ON scraped_classes(provider_name);
      CREATE INDEX IF NOT EXISTS idx_scraped_classes_uploaded ON scraped_classes(uploaded_to_backend);
      CREATE INDEX IF NOT EXISTS idx_scraped_classes_booking_status ON scraped_classes(booking_status);
    `);

    // Run migrations for enhanced data fields
    this.runMigrations();
  }

  private runMigrations(): void {
    // Check if we need to add the enhanced data columns to existing tables
    const tableInfo = this.db.prepare("PRAGMA table_info(scraped_classes)").all() as any[];
    const columnNames = tableInfo.map(col => col.name);

    // Add photos column if it doesn't exist
    if (!columnNames.includes('photos')) {
      this.db.exec('ALTER TABLE scraped_classes ADD COLUMN photos TEXT');
      logger.info('Added photos column to scraped_classes table');
    }

    // Add trainer_info column if it doesn't exist
    if (!columnNames.includes('trainer_info')) {
      this.db.exec('ALTER TABLE scraped_classes ADD COLUMN trainer_info TEXT');
      logger.info('Added trainer_info column to scraped_classes table');
    }

    // Add amenities column if it doesn't exist
    if (!columnNames.includes('amenities')) {
      this.db.exec('ALTER TABLE scraped_classes ADD COLUMN amenities TEXT');
      logger.info('Added amenities column to scraped_classes table');
    }

    // Add real_time_availability column if it doesn't exist
    if (!columnNames.includes('real_time_availability')) {
      this.db.exec('ALTER TABLE scraped_classes ADD COLUMN real_time_availability INTEGER');
      logger.info('Added real_time_availability column to scraped_classes table');
    }

    // Add booking_status column if it doesn't exist
    if (!columnNames.includes('booking_status')) {
      this.db.exec("ALTER TABLE scraped_classes ADD COLUMN booking_status TEXT CHECK(booking_status IN ('open', 'closed', 'full', 'waitlist'))");
      logger.info('Added booking_status column to scraped_classes table');
    }

    // Add last_availability_check column if it doesn't exist
    if (!columnNames.includes('last_availability_check')) {
      this.db.exec('ALTER TABLE scraped_classes ADD COLUMN last_availability_check DATETIME');
      logger.info('Added last_availability_check column to scraped_classes table');
    }

    // Add pricing_details column if it doesn't exist
    if (!columnNames.includes('pricing_details')) {
      this.db.exec('ALTER TABLE scraped_classes ADD COLUMN pricing_details TEXT');
      logger.info('Added pricing_details column to scraped_classes table');
    }

    // Add reviews column if it doesn't exist
    if (!columnNames.includes('reviews')) {
      this.db.exec('ALTER TABLE scraped_classes ADD COLUMN reviews TEXT');
      logger.info('Added reviews column to scraped_classes table');
    }

    // Add index for booking_status if it doesn't exist
    try {
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_scraped_classes_booking_status ON scraped_classes(booking_status)');
    } catch (error) {
      // Index might already exist, ignore error
    }
  }

  // Provider operations
  upsertProvider(provider: Omit<Provider, 'id'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO providers (name, enabled, total_runs, successful_runs, total_classes_found)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        enabled = excluded.enabled,
        total_runs = excluded.total_runs,
        successful_runs = excluded.successful_runs,
        total_classes_found = excluded.total_classes_found
    `);
    stmt.run(
      provider.name,
      provider.enabled ? 1 : 0,
      provider.totalRuns,
      provider.successfulRuns,
      provider.totalClassesFound
    );
  }

  getProvider(name: string): Provider | null {
    const stmt = this.db.prepare('SELECT * FROM providers WHERE name = ?');
    const row = stmt.get(name) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      enabled: Boolean(row.enabled),
      lastScrape: row.last_scrape,
      totalRuns: row.total_runs,
      successfulRuns: row.successful_runs,
      totalClassesFound: row.total_classes_found
    };
  }

  getAllProviders(): Provider[] {
    const stmt = this.db.prepare('SELECT * FROM providers ORDER BY name');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      enabled: Boolean(row.enabled),
      lastScrape: row.last_scrape,
      totalRuns: row.total_runs,
      successfulRuns: row.successful_runs,
      totalClassesFound: row.total_classes_found
    }));
  }

  updateProviderStats(name: string, successful: boolean, classesFound: number): void {
    const stmt = this.db.prepare(`
      UPDATE providers
      SET last_scrape = CURRENT_TIMESTAMP,
          total_runs = total_runs + 1,
          successful_runs = successful_runs + ?,
          total_classes_found = total_classes_found + ?
      WHERE name = ?
    `);
    stmt.run(successful ? 1 : 0, classesFound, name);
  }

  // Scrape run operations
  createScrapeRun(provider: string): number {
    const stmt = this.db.prepare(`
      INSERT INTO scrape_runs (provider, start_time, status)
      VALUES (?, CURRENT_TIMESTAMP, 'running')
    `);
    const result = stmt.run(provider);
    return result.lastInsertRowid as number;
  }

  updateScrapeRun(id: number, data: Partial<ScrapeRun>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.status) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.endTime !== undefined) {
      fields.push('end_time = ?');
      values.push(data.endTime);
    }
    if (data.classesFound !== undefined) {
      fields.push('classes_found = ?');
      values.push(data.classesFound);
    }
    if (data.classesUploaded !== undefined) {
      fields.push('classes_uploaded = ?');
      values.push(data.classesUploaded);
    }
    if (data.errors !== undefined) {
      fields.push('errors = ?');
      values.push(data.errors);
    }

    if (fields.length === 0) return;

    values.push(id);
    const stmt = this.db.prepare(`UPDATE scrape_runs SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  completeScrapeRun(id: number, success: boolean, classesFound: number, classesUploaded: number, errors?: string): void {
    const stmt = this.db.prepare(`
      UPDATE scrape_runs
      SET end_time = CURRENT_TIMESTAMP,
          status = ?,
          classes_found = ?,
          classes_uploaded = ?,
          errors = ?
      WHERE id = ?
    `);
    stmt.run(success ? 'completed' : 'failed', classesFound, classesUploaded, errors || null, id);
  }

  getScrapeRun(id: number): ScrapeRun | null {
    const stmt = this.db.prepare('SELECT * FROM scrape_runs WHERE id = ?');
    return stmt.get(id) as ScrapeRun | null;
  }

  getRecentScrapeRuns(limit: number = 10): ScrapeRun[] {
    const stmt = this.db.prepare('SELECT * FROM scrape_runs ORDER BY start_time DESC LIMIT ?');
    return stmt.all(limit) as ScrapeRun[];
  }

  // Scraped class operations
  insertScrapedClass(scrapeRunId: number, fitnessClass: FitnessClass): number {
    const stmt = this.db.prepare(`
      INSERT INTO scraped_classes (
        scrape_run_id, name, description, datetime, location_name, location_address,
        location_lat, location_long, trainer, intensity, price, booking_url,
        provider_id, provider_name, capacity, tags, uploaded_to_backend,
        photos, trainer_info, amenities, real_time_availability, booking_status,
        last_availability_check, pricing_details, reviews
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      scrapeRunId,
      fitnessClass.name,
      fitnessClass.description,
      fitnessClass.datetime.toISOString(),
      fitnessClass.location.name,
      fitnessClass.location.address,
      fitnessClass.location.lat,
      fitnessClass.location.long,
      fitnessClass.trainer,
      fitnessClass.intensity,
      fitnessClass.price,
      fitnessClass.bookingUrl,
      fitnessClass.providerId,
      fitnessClass.providerName,
      fitnessClass.capacity,
      JSON.stringify(fitnessClass.tags),
      fitnessClass.photos ? JSON.stringify(fitnessClass.photos) : null,
      fitnessClass.trainerInfo ? JSON.stringify(fitnessClass.trainerInfo) : null,
      fitnessClass.amenities ? JSON.stringify(fitnessClass.amenities) : null,
      fitnessClass.realTimeAvailability !== undefined ? fitnessClass.realTimeAvailability : null,
      fitnessClass.bookingStatus || null,
      fitnessClass.lastAvailabilityCheck ? fitnessClass.lastAvailabilityCheck.toISOString() : null,
      fitnessClass.pricingDetails ? JSON.stringify(fitnessClass.pricingDetails) : null,
      fitnessClass.reviews ? JSON.stringify(fitnessClass.reviews) : null
    );

    return result.lastInsertRowid as number;
  }

  markClassesAsUploaded(classIds: number[]): void {
    if (classIds.length === 0) return;
    const placeholders = classIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`UPDATE scraped_classes SET uploaded_to_backend = 1 WHERE id IN (${placeholders})`);
    stmt.run(...classIds);
  }

  getUnuploadedClasses(limit?: number): ScrapedClass[] {
    const query = limit
      ? 'SELECT * FROM scraped_classes WHERE uploaded_to_backend = 0 LIMIT ?'
      : 'SELECT * FROM scraped_classes WHERE uploaded_to_backend = 0';

    const stmt = this.db.prepare(query);
    const rows = limit ? stmt.all(limit) : stmt.all();

    return (rows as any[]).map(row => this.rowToScrapedClass(row));
  }

  getClassesByRunId(scrapeRunId: number): ScrapedClass[] {
    const stmt = this.db.prepare('SELECT * FROM scraped_classes WHERE scrape_run_id = ?');
    const rows = stmt.all(scrapeRunId) as any[];
    return rows.map(row => this.rowToScrapedClass(row));
  }

  private rowToScrapedClass(row: any): ScrapedClass {
    return {
      id: row.id,
      scrapeRunId: row.scrape_run_id,
      name: row.name,
      description: row.description,
      datetime: new Date(row.datetime),
      location: {
        name: row.location_name,
        address: row.location_address,
        lat: row.location_lat,
        long: row.location_long
      },
      trainer: row.trainer,
      intensity: row.intensity,
      price: row.price,
      bookingUrl: row.booking_url,
      providerId: row.provider_id,
      providerName: row.provider_name,
      capacity: row.capacity,
      tags: JSON.parse(row.tags),
      uploadedToBackend: Boolean(row.uploaded_to_backend),
      createdAt: row.created_at,
      // Enhanced fields
      photos: row.photos ? JSON.parse(row.photos) : undefined,
      trainerInfo: row.trainer_info ? JSON.parse(row.trainer_info) : undefined,
      amenities: row.amenities ? JSON.parse(row.amenities) : undefined,
      realTimeAvailability: row.real_time_availability !== null ? row.real_time_availability : undefined,
      bookingStatus: row.booking_status || undefined,
      lastAvailabilityCheck: row.last_availability_check ? new Date(row.last_availability_check) : undefined,
      pricingDetails: row.pricing_details ? JSON.parse(row.pricing_details) : undefined,
      reviews: row.reviews ? JSON.parse(row.reviews) : undefined
    };
  }

  // Check for duplicate classes
  isDuplicateClass(providerId: string, datetime: Date): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM scraped_classes
      WHERE provider_id = ? AND datetime = ?
    `);
    const result = stmt.get(providerId, datetime.toISOString()) as { count: number };
    return result.count > 0;
  }

  close(): void {
    this.db.close();
    logger.info('Database connection closed');
  }
}
