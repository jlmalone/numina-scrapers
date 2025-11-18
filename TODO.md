# TODO - Numina Scrapers

## Priority: High

### Additional Provider Implementations

1. **24 Hour Fitness** (Priority: High)
   - Large national gym chain
   - Offers group fitness classes at all locations
   - Website: https://www.24hourfitness.com
   - Implementation effort: Medium
   - Expected classes: 1000s weekly

2. **Planet Fitness** (Priority: High)
   - Massive chain with 2000+ locations
   - Focus on circuit training and basic fitness classes
   - Website: https://www.planetfitness.com
   - Implementation effort: Medium
   - Expected classes: 500+ weekly

3. **LA Fitness** (Priority: High)
   - National chain with extensive group fitness programs
   - Website: https://www.lafitness.com
   - Implementation effort: Medium
   - Expected classes: 1500+ weekly

### Core Enhancements

4. **Geocoding Cache**
   - Implement SQLite-based geocoding cache
   - Reduce API calls for repeated addresses
   - Add cache expiry logic (30 days)
   - Estimated time: 4 hours

5. **Rate Limiting Improvements**
   - Add exponential backoff for failed requests
   - Implement per-provider rate limiting
   - Add request queue system
   - Estimated time: 6 hours

6. **Error Recovery**
   - Automatic retry logic for failed scrapes
   - Save partial results on failure
   - Resume from last successful page
   - Estimated time: 8 hours

## Priority: Medium

### Boutique Fitness Providers

7. **SoulCycle** (Priority: Medium)
   - Premium indoor cycling studio chain
   - Website: https://www.soul-cycle.com
   - Implementation effort: Low
   - Expected classes: 200+ weekly

8. **Barry's Bootcamp** (Priority: Medium)
   - High-intensity interval training studios
   - Website: https://www.barrysbootcamp.com
   - Implementation effort: Low
   - Expected classes: 150+ weekly

9. **CorePower Yoga** (Priority: Medium)
   - Large yoga studio chain
   - Website: https://www.corepoweryoga.com
   - Implementation effort: Low
   - Expected classes: 500+ weekly

10. **Orangetheory Fitness** (Priority: Medium)
    - Science-based interval training
    - Website: https://www.orangetheory.com
    - Implementation effort: Medium
    - Expected classes: 800+ weekly

11. **Pure Barre** (Priority: Medium)
    - Barre fitness studios
    - Website: https://www.purebarre.com
    - Implementation effort: Low
    - Expected classes: 300+ weekly

### Platform Integrations

12. **Gympass** (Priority: Medium)
    - Corporate wellness platform
    - Aggregates multiple studios
    - Website: https://www.gympass.com
    - Implementation effort: High (may require authentication)
    - Expected classes: 5000+ weekly

13. **Peerfit** (Priority: Medium)
    - Corporate fitness platform
    - Website: https://www.peerfit.com
    - Implementation effort: High
    - Expected classes: 2000+ weekly

### Regional/Specialty Providers

14. **Peloton Studios** (Priority: Medium)
    - In-person classes at Peloton locations
    - Website: https://www.onepeloton.com/studio
    - Implementation effort: Low
    - Expected classes: 100+ weekly

15. **Crunch Fitness** (Priority: Medium)
    - National gym chain with unique classes
    - Website: https://www.crunch.com
    - Implementation effort: Medium
    - Expected classes: 400+ weekly

16. **Gold's Gym** (Priority: Medium)
    - Classic gym chain
    - Website: https://www.goldsgym.com
    - Implementation effort: Medium
    - Expected classes: 600+ weekly

17. **Lifetime Fitness** (Priority: Low)
    - Premium fitness clubs
    - Website: https://www.lifetime.life
    - Implementation effort: Medium
    - Expected classes: 800+ weekly

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

- F45 Training
- Title Boxing Club
- CycleBar
- Club Pilates
- YogaWorks
- Xponential Fitness brands
- Anytime Fitness
- Snap Fitness
- Flywheel Sports
- Row House
- Rumble Boxing

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
