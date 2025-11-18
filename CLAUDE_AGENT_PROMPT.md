# 🤖 CLAUDE CODE WEB AGENT PROMPT

**Version**: 1.0.0
**Last Updated**: 2025-01-18

---

## ⚠️ IDEMPOTENCY CHECK - READ THIS FIRST ⚠️

**BEFORE DOING ANYTHING ELSE**, you MUST check if this task has already been completed:

1. **Check for `.agent-completed` file** in the project root directory
2. **If the file exists**:
   - Read its contents
   - Verify the completion timestamp and status
   - Respond with: "✅ This task has already been completed on [timestamp]. See README.md for details."
   - **DO NOT** re-run the implementation
   - **DO NOT** modify existing files
   - Exit gracefully

3. **If the file does NOT exist**:
   - Proceed with the task implementation below
   - When completely finished, create `.agent-completed` with completion details

**Purpose**: This ensures the agent can be run multiple times without duplicating work.

---

# TASK: Build Numina Class Scraping & Ingestion System

## Repository Purpose
You are working on `numina-scrapers`, the TypeScript/Node.js service responsible for scraping group fitness class data from various providers (gyms, studios, class platforms) and pushing it to the `numina-backend` API.

## Current State
Repository initialized with basic README. Starting from scratch.

**Reference codebase**: The owner has a project called `godfather` (located at ~/WebstormProjects/godfather) which is a TypeScript/Puppeteer-based web scraper with cinema/Instagram automation. You can use similar architectural patterns but adapt for fitness class providers.

## Your Task
Create a modular, provider-based scraping system with the following features:

### Core Requirements

1. **Project Structure**
   - TypeScript with modern ES modules
   - Puppeteer for browser automation
   - Node.js 20+
   - Modular "provider adapter" architecture
   - SQLite database for tracking scrape operations
   - API client for pushing data to numina-backend

2. **Provider Adapter Pattern**
   ```typescript
   interface ProviderAdapter {
     name: string;
     scrapeClasses(options: ScrapeOptions): Promise<FitnessClass[]>;
     validateClass(classData: any): boolean;
   }
   ```

3. **Initial Provider Adapters** (implement 2-3)
   - **Mindbody** (major gym/studio booking platform)
   - **ClassPass** (if publicly scrapable)
   - **Local gym chain** (pick 1 local chain with public schedules - e.g., Equinox, 24 Hour Fitness)
   - Design for easy addition of new providers

4. **Data Model**
   ```typescript
   interface FitnessClass {
     name: string;
     description: string;
     datetime: Date;
     location: {
       name: string;
       address: string;
       lat: number;
       long: number;
     };
     trainer: string;
     intensity: number; // 1-10
     price: number;
     bookingUrl: string;
     providerId: string;
     providerName: string;
     capacity: number;
     tags: string[]; // yoga, hiit, spin, pilates, etc.
   }
   ```

5. **Scraping Infrastructure**
   - Chrome/Puppeteer management (headless mode)
   - Rate limiting and polite scraping (respect robots.txt)
   - Error handling and retry logic
   - Duplicate detection (don't re-scrape same classes)
   - Incremental scraping (only new/updated classes)

6. **Database for Operations Tracking**
   - SQLite database schema:
     - `scrape_runs`: track each scrape execution
     - `scraped_classes`: store raw scraped data before pushing to backend
     - `providers`: provider configuration and status
   - Track success/failure rates per provider

7. **Backend Integration**
   - API client to POST classes to `numina-backend` at `/api/v1/classes`
   - Batch uploads (e.g., 50 classes at a time)
   - Handle API errors gracefully
   - Idempotent uploads (avoid duplicates)

### Technical Constraints

- **Language**: TypeScript (Node.js 20+)
- **Automation**: Puppeteer for browser control
- **Database**: SQLite for local operations tracking
- **HTTP Client**: Fetch API or Axios for backend communication
- **Testing**: Jest with Puppeteer integration tests

### File Structure
```
numina-scrapers/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Main CLI entry point
│   ├── providers/                  # Provider adapters
│   │   ├── BaseProvider.ts
│   │   ├── MindbodyProvider.ts
│   │   ├── ClassPassProvider.ts
│   │   └── EquinoxProvider.ts
│   ├── core/
│   │   ├── ChromeManager.ts        # Puppeteer Chrome management
│   │   ├── Database.ts             # SQLite operations
│   │   ├── BackendClient.ts        # API client for numina-backend
│   │   └── Scheduler.ts            # Cron-based scheduling
│   ├── models/
│   │   └── FitnessClass.ts
│   └── utils/
│       ├── geocoding.ts            # Address → lat/long
│       ├── validation.ts           # Data validation
│       └── logger.ts               # Logging utility
├── config/
│   └── providers.json              # Provider configuration
├── tests/
└── README.md
```

### Acceptance Criteria

1. ✅ Successfully scrapes classes from at least 2 providers
2. ✅ Extracts all required fields (name, time, location, price, booking URL)
3. ✅ Geocodes addresses to lat/long coordinates
4. ✅ Pushes scraped data to numina-backend API
5. ✅ Handles errors gracefully (network issues, page structure changes)
6. ✅ Tracks scraping operations in SQLite database
7. ✅ CLI interface: `npm run scrape -- --provider=mindbody`
8. ✅ Scheduler for automated daily scrapes
9. ✅ Deduplication logic (avoid duplicate classes)
10. ✅ Comprehensive logging and monitoring

### Deliverables

- Complete TypeScript scraping service
- At least 2 working provider adapters
- SQLite database with operations tracking
- Backend API integration
- CLI and scheduling system
- `.gitignore` file (exclude node_modules/, dist/, *.db, config/*.json with secrets)
- README with:
  - Setup instructions
  - How to add new providers
  - Configuration guide
  - Scraping best practices
- TODO.md with next providers to add

### How to Report Back

1. **Update README.md** with:
   - Quick start guide
   - Provider adapter documentation
   - How to add new providers (step-by-step)
   - CLI command reference
   - Scheduling setup instructions
   - Architecture diagram (ASCII or markdown)
   - List of 10+ potential future providers

2. **Create TODO.md** with prioritized next providers and features

3. **Create `.agent-completed` file** with content:
   ```
   AGENT_PROMPT_VERSION: 1.0.0
   COMPLETED: [timestamp in ISO 8601 format]
   STATUS: SUCCESS

   Summary: Numina scrapers implemented successfully
   Providers: [list of implemented providers]
   Acceptance Criteria: All met ✅

   Files Created: [count]
   Total Lines of Code: [approximate count]

   Next Steps: See TODO.md for future enhancements

   --- DO NOT DELETE THIS FILE ---
   This file marks task completion for idempotency.
   If you need to re-run the agent, delete this file first.
   ```

4. **Commit and push** all changes with message:
   ```
   feat: Implement scraping infrastructure with initial providers

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>
   ```
