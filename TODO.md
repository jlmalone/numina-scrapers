# TODO - Numina Scrapers

## Recently Completed (Wave 2)

✅ **SoulCycle** - Premium indoor cycling (90+ studios)
✅ **Barry's Bootcamp** - High-intensity interval training (80+ studios)
✅ **Orangetheory Fitness** - Heart rate-based training (1,500+ studios)
✅ **CorePower Yoga** - Modern yoga studios (200+ studios)
✅ **F45 Training** - Functional training (4,000+ studios)

**Current Provider Count: 8 providers**

---

## Priority: High

### Additional Provider Implementations (Wave 3)

1. **Planet Fitness** (Priority: High)
   - Massive chain with 2000+ locations
   - Focus on circuit training and basic fitness classes
   - Website: https://www.planetfitness.com
   - Implementation effort: Medium
   - Expected classes: 500+ weekly

2. **LA Fitness** (Priority: High)
   - National chain with extensive group fitness programs
   - Website: https://www.lafitness.com
   - Implementation effort: Medium
   - Expected classes: 1500+ weekly

3. **24 Hour Fitness** (Priority: High)
   - Large national gym chain
   - Offers group fitness classes at all locations
   - Website: https://www.24hourfitness.com
   - Implementation effort: Medium
   - Expected classes: 1000s weekly

4. **Crunch Fitness** (Priority: High)
   - National gym chain with unique classes
   - Website: https://www.crunch.com
   - Implementation effort: Medium
   - Expected classes: 400+ weekly

5. **Pure Barre** (Priority: High)
   - Barre fitness studios
   - Website: https://www.purebarre.com
   - Implementation effort: Low
   - Expected classes: 300+ weekly

### Core Enhancements

6. **Geocoding Cache**
   - Implement SQLite-based geocoding cache
   - Reduce API calls for repeated addresses
   - Add cache expiry logic (30 days)
   - Estimated time: 4 hours

7. **Rate Limiting Improvements**
   - Add exponential backoff for failed requests
   - Implement per-provider rate limiting
   - Add request queue system
   - Estimated time: 6 hours

8. **Error Recovery**
   - Automatic retry logic for failed scrapes
   - Save partial results on failure
   - Resume from last successful page
   - Estimated time: 8 hours

## Priority: Medium

### Boutique Fitness Providers (Wave 4)

9. **CycleBar** (Priority: Medium)
   - Premium indoor cycling chain
   - Website: https://www.cyclebar.com
   - Implementation effort: Low
   - Expected classes: 400+ weekly

10. **Club Pilates** (Priority: Medium)
    - Reformer-based Pilates studios
    - Website: https://www.clubpilates.com
    - Implementation effort: Low
    - Expected classes: 600+ weekly

11. **YogaWorks** (Priority: Medium)
    - Traditional yoga studio chain
    - Website: https://www.yogaworks.com
    - Implementation effort: Low
    - Expected classes: 300+ weekly

12. **Title Boxing Club** (Priority: Medium)
    - Boxing and kickboxing fitness studios
    - Website: https://titleboxingclub.com
    - Implementation effort: Low
    - Expected classes: 250+ weekly

13. **Rumble Boxing** (Priority: Medium)
    - Boutique boxing studios
    - Website: https://www.rumbleboxinggym.com
    - Implementation effort: Low
    - Expected classes: 150+ weekly

### Platform Integrations

14. **Gympass** (Priority: Medium)
    - Corporate wellness platform
    - Aggregates multiple studios
    - Website: https://www.gympass.com
    - Implementation effort: High (may require authentication)
    - Expected classes: 5000+ weekly

15. **Peerfit** (Priority: Medium)
    - Corporate fitness platform
    - Website: https://www.peerfit.com
    - Implementation effort: High
    - Expected classes: 2000+ weekly

### Regional/Specialty Providers (Wave 5)

16. **Peloton Studios** (Priority: Medium)
    - In-person classes at Peloton locations
    - Website: https://www.onepeloton.com/studio
    - Implementation effort: Low
    - Expected classes: 100+ weekly

17. **Gold's Gym** (Priority: Medium)
    - Classic gym chain
    - Website: https://www.goldsgym.com
    - Implementation effort: Medium
    - Expected classes: 600+ weekly

18. **Lifetime Fitness** (Priority: Medium)
    - Premium fitness clubs
    - Website: https://www.lifetime.life
    - Implementation effort: Medium
    - Expected classes: 800+ weekly

19. **Anytime Fitness** (Priority: Medium)
    - 24/7 gym chain with group classes
    - Website: https://www.anytimefitness.com
    - Implementation effort: Medium
    - Expected classes: 500+ weekly

20. **Snap Fitness** (Priority: Low)
    - 24/7 compact fitness centers
    - Website: https://www.snapfitness.com
    - Implementation effort: Low
    - Expected classes: 200+ weekly

## Features & Improvements

### Testing & Quality

18. **Unit Tests**
    - Add Jest tests for all providers
    - Test geocoding and validation utilities
    - Mock Puppeteer for faster tests
    - Target: 80% code coverage
    - Estimated time: 16 hours

19. **Integration Tests**
    - End-to-end scraping tests
    - Backend API integration tests
    - Database operation tests
    - Estimated time: 12 hours

### Performance Optimizations

20. **Parallel Scraping**
    - Scrape multiple providers simultaneously
    - Worker pool for concurrent scraping
    - Resource limits and throttling
    - Estimated time: 10 hours

21. **Incremental Updates**
    - Only scrape new/updated classes
    - Track last scrape timestamp per location
    - Differential uploads to backend
    - Estimated time: 8 hours

22. **Memory Optimization**
    - Stream large result sets
    - Batch processing improvements
    - Chrome instance pooling
    - Estimated time: 6 hours

### Monitoring & Observability

23. **Metrics Dashboard**
    - Prometheus/Grafana integration
    - Track scrape success rates
    - Monitor API response times
    - Alert on failures
    - Estimated time: 12 hours

24. **Health Checks**
    - HTTP health endpoint
    - Database connectivity check
    - Backend API availability check
    - Provider status monitoring
    - Estimated time: 4 hours

25. **Structured Logging**
    - JSON-formatted logs
    - Log aggregation (ELK/Datadog)
    - Request tracing
    - Performance logging
    - Estimated time: 6 hours

### Data Quality

26. **Class Deduplication Improvements**
    - Fuzzy matching for similar classes
    - Handle time zone differences
    - Merge duplicate venues
    - Estimated time: 8 hours

27. **Data Validation Enhancement**
    - Schema validation with Zod/Joi
    - Address normalization
    - Price validation and conversion
    - Estimated time: 6 hours

28. **Image Scraping**
    - Scrape class images/photos
    - Studio images
    - Instructor photos
    - Store in CDN
    - Estimated time: 10 hours

### DevOps & Deployment

29. **Docker Container**
    - Create Dockerfile
    - Docker Compose for local dev
    - Multi-stage builds
    - Estimated time: 4 hours

30. **CI/CD Pipeline**
    - GitHub Actions workflow
    - Automated testing
    - Automated deployment
    - Estimated time: 8 hours

31. **Cloud Deployment**
    - AWS/GCP deployment scripts
    - Kubernetes manifests
    - Auto-scaling configuration
    - Estimated time: 16 hours

### API & Integration

32. **REST API**
    - Expose scraper as API service
    - Trigger scrapes via API
    - Query scrape status
    - Estimated time: 12 hours

33. **Webhook Support**
    - Notify backend on scrape completion
    - Error notifications
    - Custom webhook handlers
    - Estimated time: 6 hours

34. **GraphQL Interface**
    - Query scraped classes
    - Filter and search capabilities
    - Real-time subscriptions
    - Estimated time: 16 hours

## Low Priority / Future Considerations

35. **Machine Learning Features**
    - Auto-detect class types from descriptions
    - Predict class intensity
    - Recommend similar classes
    - Estimated time: 40+ hours

36. **Mobile App Data Sources**
    - Reverse engineer mobile APIs
    - Extract data from apps
    - OAuth integration
    - Estimated time: 20+ hours

37. **User Reviews Scraping**
    - Scrape class reviews
    - Instructor ratings
    - Sentiment analysis
    - Estimated time: 16 hours

38. **Multi-Language Support**
    - Scrape international providers
    - Translation integration
    - Timezone handling improvements
    - Estimated time: 20 hours

## Provider Research Needed

The following providers need research to determine scrapability:

- Xponential Fitness brands (StretchLab, AKT, etc.)
- Flywheel Sports
- Row House
- Solidcore
- Blink Fitness
- Retro Fitness
- YouFit Health Clubs
- UFC Gym
- Workout Anytime
- Powerhouse Gym

## Infrastructure Improvements

39. **Database Migrations**
    - Add migration system (e.g., node-pg-migrate)
    - Version control for schema
    - Rollback capabilities
    - Estimated time: 6 hours

40. **Configuration Management**
    - Environment-based configs
    - Secrets management (AWS Secrets Manager)
    - Feature flags
    - Estimated time: 8 hours

41. **Backup & Recovery**
    - Automated database backups
    - Point-in-time recovery
    - Disaster recovery plan
    - Estimated time: 8 hours

---

**Total Estimated Effort**: 350+ hours
**Recommended Next Steps**: Start with items 1-6, then 18-19
