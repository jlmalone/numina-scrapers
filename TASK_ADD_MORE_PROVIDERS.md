# 🤖 WAVE 2 TASK: Add More Scraper Providers

> **IMPORTANT**: Before starting, check if `.task-more-providers-completed` file exists.
> If it exists, respond: "✅ This task has already been completed."
> **When finished**, create `.task-more-providers-completed` file with timestamp and summary.

---

# TASK: Add 5+ Additional Fitness Class Providers

## Context
This is a **Wave 2 enhancement** for the numina-scrapers project. The base infrastructure should already exist with 2-3 initial providers.

## Your Task
Add scraper adapters for at least **5 additional** fitness class providers.

### Priority Providers to Add

1. **SoulCycle** - Premium indoor cycling classes
   - Website: soulcycle.com
   - Focus: Class schedules, locations, pricing

2. **Barry's Bootcamp** - High-intensity interval training
   - Website: barrys.com
   - Focus: Class schedules, instructor info, pricing

3. **Orangetheory Fitness** - Heart rate-based interval training
   - Website: orangetheory.com
   - Focus: Class schedules, studio locations

4. **CorePower Yoga** - Yoga studio chain
   - Website: corepoweryoga.com
   - Focus: Class types, schedules, pricing tiers

5. **F45 Training** - Functional training
   - Website: f45training.com
   - Focus: Workout types, class times, locations

6. **BONUS: Planet Fitness** - Budget gym chain
   - Website: planetfitness.com
   - Focus: Open gym hours, class schedules if available

7. **BONUS: LA Fitness** - Full-service gym
   - Website: lafitness.com
   - Focus: Group fitness class schedules

### Requirements for Each Provider

1. **Create Provider Adapter** following existing pattern:
   ```typescript
   class [Provider]Provider extends BaseProvider {
     name = "[ProviderName]";

     async scrapeClasses(options: ScrapeOptions): Promise<FitnessClass[]> {
       // Implementation
     }

     validateClass(classData: any): boolean {
       // Validation logic
     }
   }
   ```

2. **Handle Provider-Specific Challenges**:
   - Authentication/cookies if required
   - Dynamic content loading
   - Rate limiting
   - Geographic filtering (location-based class listings)
   - Schedule pagination

3. **Data Quality**:
   - Extract all required fields (name, time, location, trainer, price, etc.)
   - Geocode addresses to lat/long
   - Normalize pricing (handle free trials, memberships, drop-in rates)
   - Categorize class types (map provider-specific names to standard tags)

4. **Testing**:
   - Test each provider adapter independently
   - Verify data quality (spot-check 5-10 classes per provider)
   - Ensure deduplication works across providers

5. **Configuration**:
   - Add provider configs to `config/providers.json`
   - Document any provider-specific setup (API keys, location codes, etc.)

### Deliverables

1. **5+ New Provider Adapters** in `src/providers/`
2. **Updated README.md** with:
   - List of all supported providers (now 7-10 total)
   - Provider-specific setup instructions
   - Known limitations per provider
3. **Updated TODO.md** with next 10+ providers to add
4. **Provider Comparison Table** in README showing:
   - Provider name
   - Coverage (# of locations scraped)
   - Data quality score
   - Update frequency
   - Special requirements

### Acceptance Criteria

1. ✅ At least 5 new providers successfully implemented
2. ✅ Each provider can scrape at least 10 classes successfully
3. ✅ All required fields extracted for each provider
4. ✅ Geocoding works for all addresses
5. ✅ No duplicate classes in database after running all providers
6. ✅ Updated documentation reflects new providers
7. ✅ CLI works with new provider flags: `npm run scrape -- --provider=soulcycle`

### How to Report Back

1. **Update README.md** with provider comparison table and setup instructions
2. **Update TODO.md** with next 10+ providers to add
3. **Create `.task-more-providers-completed`** file with:
   ```
   Completed: [timestamp]
   Providers Added: [list of 5+ providers]
   Total Providers: [count]
   Classes Scraped: [approximate total across all providers]
   Next: See TODO.md for additional providers
   ```
4. **Commit and push** with message:
   ```
   feat: Add 5+ additional fitness class providers

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>
   ```
