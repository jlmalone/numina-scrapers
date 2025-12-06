#!/usr/bin/env node

import { Command } from 'commander';
import { ChromeManager } from './core/ChromeManager.js';
import { DatabaseManager } from './core/Database.js';
import { BackendClient } from './core/BackendClient.js';
import { Scheduler, commonSchedules } from './core/Scheduler.js';
import { MindbodyProvider } from './providers/MindbodyProvider.js';
import { EquinoxProvider } from './providers/EquinoxProvider.js';
import { ClassPassProvider } from './providers/ClassPassProvider.js';
import { SoulCycleProvider } from './providers/SoulCycleProvider.js';
import { BarrysProvider } from './providers/BarrysProvider.js';
import { OrangetheoryProvider } from './providers/OrangetheoryProvider.js';
import { CorePowerYogaProvider } from './providers/CorePowerYogaProvider.js';
import { F45Provider } from './providers/F45Provider.js';
import { PlanetFitnessProvider } from './providers/PlanetFitnessProvider.js';
import { LAFitnessProvider } from './providers/LAFitnessProvider.js';
import { TwentyFourHourFitnessProvider } from './providers/TwentyFourHourFitnessProvider.js';
import { GoldsGymProvider } from './providers/GoldsGymProvider.js';
import { BaseProvider } from './providers/BaseProvider.js';
import { logger } from './utils/logger.js';
import { ScrapeOptions } from './models/FitnessClass.js';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Load configuration
const configPath = join(projectRoot, 'config', 'providers.json');
let config: any = {};

if (existsSync(configPath)) {
  config = JSON.parse(readFileSync(configPath, 'utf-8'));
} else {
  logger.warn('providers.json not found, using defaults');
}

// Initialize core services
const chromeManager = new ChromeManager({ headless: true });
const db = new DatabaseManager();
const backendClient = new BackendClient({
  baseUrl: process.env.BACKEND_URL || config.backendUrl || 'http://localhost:3000',
  apiKey: process.env.BACKEND_API_KEY || config.backendApiKey,
  batchSize: 50
});

// Initialize providers
const providers = new Map<string, BaseProvider>();

function initializeProviders(): void {
  const mindbodyConfig = config.providers?.mindbody || { enabled: true, baseUrl: 'https://example.mindbody.io' };
  const equinoxConfig = config.providers?.equinox || { enabled: true, baseUrl: 'https://www.equinox.com' };
  const classpassConfig = config.providers?.classpass || { enabled: true, baseUrl: 'https://classpass.com' };
  const soulcycleConfig = config.providers?.soulcycle || { enabled: true, baseUrl: 'https://www.soulcycle.com' };
  const barrysConfig = config.providers?.barrys || { enabled: true, baseUrl: 'https://www.barrys.com' };
  const orangetheoryConfig = config.providers?.orangetheory || { enabled: true, baseUrl: 'https://www.orangetheory.com' };
  const corepoweryogaConfig = config.providers?.corepoweryoga || { enabled: true, baseUrl: 'https://www.corepoweryoga.com' };
  const f45Config = config.providers?.f45 || { enabled: true, baseUrl: 'https://f45training.com' };
  const planetfitnessConfig = config.providers?.planetfitness || { enabled: true, baseUrl: 'https://www.planetfitness.com' };
  const lafitnessConfig = config.providers?.lafitness || { enabled: true, baseUrl: 'https://www.lafitness.com' };
  const twentyfourfitnessConfig = config.providers?.['24hourfitness'] || { enabled: true, baseUrl: 'https://www.24hourfitness.com' };
  const goldsgymConfig = config.providers?.goldsgym || { enabled: true, baseUrl: 'https://www.goldsgym.com' };

  providers.set('mindbody', new MindbodyProvider(chromeManager, mindbodyConfig));
  providers.set('equinox', new EquinoxProvider(chromeManager, equinoxConfig));
  providers.set('classpass', new ClassPassProvider(chromeManager, classpassConfig));
  providers.set('soulcycle', new SoulCycleProvider(chromeManager, soulcycleConfig));
  providers.set('barrys', new BarrysProvider(chromeManager, barrysConfig));
  providers.set('orangetheory', new OrangetheoryProvider(chromeManager, orangetheoryConfig));
  providers.set('corepoweryoga', new CorePowerYogaProvider(chromeManager, corepoweryogaConfig));
  providers.set('f45', new F45Provider(chromeManager, f45Config));
  providers.set('planetfitness', new PlanetFitnessProvider(chromeManager, planetfitnessConfig));
  providers.set('lafitness', new LAFitnessProvider(chromeManager, lafitnessConfig));
  providers.set('24hourfitness', new TwentyFourHourFitnessProvider(chromeManager, twentyfourfitnessConfig));
  providers.set('goldsgym', new GoldsGymProvider(chromeManager, goldsgymConfig));

  logger.info(`Initialized ${providers.size} providers`);
}

// Initialize CLI
const program = new Command();

program
  .name('numina-scrapers')
  .description('Scrape group fitness class data from various providers')
  .version('1.0.0');

// Scrape command
program
  .command('scrape')
  .description('Scrape classes from a provider')
  .option('-p, --provider <name>', 'Provider name (mindbody, equinox, classpass, soulcycle, barrys, orangetheory, corepoweryoga, f45, planetfitness, lafitness, 24hourfitness, goldsgym, or all)')
  .option('-l, --location <location>', 'Location to search')
  .option('-s, --start-date <date>', 'Start date (YYYY-MM-DD)')
  .option('-e, --end-date <date>', 'End date (YYYY-MM-DD)')
  .option('-m, --max-results <number>', 'Maximum number of results', parseInt)
  .option('--no-upload', 'Skip uploading to backend')
  .action(async (options) => {
    try {
      initializeProviders();

      const providerName = options.provider || 'all';
      const upload = options.upload !== false;

      logger.info(`Starting scrape for provider: ${providerName}`);

      // Build scrape options
      const scrapeOptions: ScrapeOptions = {
        location: options.location,
        startDate: options.startDate ? new Date(options.startDate) : undefined,
        endDate: options.endDate ? new Date(options.endDate) : undefined,
        maxResults: options.maxResults
      };

      // Determine which providers to run
      const providersToRun: BaseProvider[] = [];
      if (providerName === 'all') {
        providersToRun.push(...Array.from(providers.values()).filter(p => p.isEnabled()));
      } else {
        const provider = providers.get(providerName);
        if (!provider) {
          logger.error(`Provider "${providerName}" not found`);
          process.exit(1);
        }
        if (!provider.isEnabled()) {
          logger.error(`Provider "${providerName}" is disabled`);
          process.exit(1);
        }
        providersToRun.push(provider);
      }

      // Initialize Chrome
      await chromeManager.initialize();

      // Run scrapers
      for (const provider of providersToRun) {
        const scrapeRunId = db.createScrapeRun(provider.getName());

        try {
          logger.info(`Scraping ${provider.getName()}...`);
          const result = await provider.scrapeClasses(scrapeOptions);

          logger.info(`Scrape result: ${result.classesFound} classes found`);

          // Save to database
          for (const fitnessClass of result.classes) {
            if (!db.isDuplicateClass(fitnessClass.providerId, fitnessClass.datetime)) {
              db.insertScrapedClass(scrapeRunId, fitnessClass);
            }
          }

          // Upload to backend if enabled
          let uploaded = 0;
          if (upload && result.classes.length > 0) {
            logger.info('Uploading classes to backend...');
            const uploadResult = await backendClient.uploadClasses(result.classes);
            uploaded = uploadResult.uploaded;
            logger.info(`Upload complete: ${uploaded} classes uploaded`);
          }

          // Update scrape run
          db.completeScrapeRun(
            scrapeRunId,
            result.success,
            result.classesFound,
            uploaded,
            result.errors.join('; ')
          );

          // Update provider stats
          db.updateProviderStats(provider.getName(), result.success, result.classesFound);

        } catch (error) {
          logger.error(`Error scraping ${provider.getName()}:`, error);
          db.completeScrapeRun(scrapeRunId, false, 0, 0, String(error));
        }
      }

      await chromeManager.close();
      logger.info('Scraping complete');

    } catch (error) {
      logger.error('Scrape command failed:', error);
      process.exit(1);
    } finally {
      db.close();
    }
  });

// Schedule command
program
  .command('schedule')
  .description('Start scheduled scraping')
  .option('-s, --schedule <cron>', 'Cron schedule expression', commonSchedules.daily2am)
  .action(async (options) => {
    try {
      initializeProviders();

      const scheduler = new Scheduler();

      // Add scheduled tasks for each enabled provider
      for (const [name, provider] of providers) {
        if (provider.isEnabled()) {
          scheduler.addTask({
            id: `scrape-${name}`,
            name: `Scrape ${name}`,
            schedule: options.schedule,
            enabled: true,
            task: async () => {
              const scrapeRunId = db.createScrapeRun(name);

              try {
                await chromeManager.initialize();
                const result = await provider.scrapeClasses({});

                for (const fitnessClass of result.classes) {
                  if (!db.isDuplicateClass(fitnessClass.providerId, fitnessClass.datetime)) {
                    db.insertScrapedClass(scrapeRunId, fitnessClass);
                  }
                }

                const uploadResult = await backendClient.uploadClasses(result.classes);
                db.completeScrapeRun(scrapeRunId, result.success, result.classesFound, uploadResult.uploaded);
                db.updateProviderStats(name, result.success, result.classesFound);

                await chromeManager.close();
              } catch (error) {
                logger.error(`Scheduled scrape failed for ${name}:`, error);
                db.completeScrapeRun(scrapeRunId, false, 0, 0, String(error));
              }
            }
          });
        }
      }

      logger.info(`Scheduler started with ${scheduler.getTasks().length} tasks`);
      logger.info(`Schedule: ${options.schedule}`);
      scheduler.startAll();

      // Keep process running
      process.on('SIGINT', () => {
        logger.info('Stopping scheduler...');
        scheduler.stopAll();
        db.close();
        process.exit(0);
      });

    } catch (error) {
      logger.error('Schedule command failed:', error);
      process.exit(1);
    }
  });

// Stats command
program
  .command('stats')
  .description('Show scraping statistics')
  .action(() => {
    try {
      const providers = db.getAllProviders();
      const recentRuns = db.getRecentScrapeRuns(10);

      console.log('\n=== Provider Statistics ===\n');
      for (const provider of providers) {
        console.log(`${provider.name}:`);
        console.log(`  Enabled: ${provider.enabled}`);
        console.log(`  Total Runs: ${provider.totalRuns}`);
        console.log(`  Successful: ${provider.successfulRuns}`);
        console.log(`  Classes Found: ${provider.totalClassesFound}`);
        console.log(`  Last Scrape: ${provider.lastScrape || 'Never'}`);
        console.log('');
      }

      console.log('\n=== Recent Scrape Runs ===\n');
      for (const run of recentRuns) {
        console.log(`[${run.startTime}] ${run.provider} - ${run.status}`);
        console.log(`  Classes: ${run.classesFound}, Uploaded: ${run.classesUploaded}`);
        if (run.errors) {
          console.log(`  Errors: ${run.errors}`);
        }
        console.log('');
      }

      db.close();
    } catch (error) {
      logger.error('Stats command failed:', error);
      process.exit(1);
    }
  });

// Upload command (upload pending classes)
program
  .command('upload')
  .description('Upload pending classes to backend')
  .option('-l, --limit <number>', 'Limit number of classes to upload', parseInt)
  .action(async (options) => {
    try {
      const classes = db.getUnuploadedClasses(options.limit);

      if (classes.length === 0) {
        logger.info('No pending classes to upload');
        db.close();
        return;
      }

      logger.info(`Uploading ${classes.length} pending classes...`);
      const result = await backendClient.uploadClasses(classes);

      if (result.uploaded > 0) {
        const classIds = classes.slice(0, result.uploaded).map(c => c.id!);
        db.markClassesAsUploaded(classIds);
      }

      logger.info(`Upload complete: ${result.uploaded} uploaded, ${result.failed} failed`);
      db.close();

    } catch (error) {
      logger.error('Upload command failed:', error);
      process.exit(1);
    }
  });

program.parse();
