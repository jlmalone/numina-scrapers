# TASK: Add Enhanced Data Extraction to Numina Scrapers

> **IMPORTANT**: Check for `.task-enhanced-data-completed` before starting.
> **When finished**, create `.task-enhanced-data-completed` file.

## 🎯 OBJECTIVE

Enhance scrapers to extract richer data: reviews, photos, trainer bios, amenities, real-time availability.

## 📋 REQUIREMENTS

### Enhanced Data Points

1. **Class Photos**
   - Extract class/studio photos from provider sites
   - Multiple photos per class (up to 5)
   - Download and store locally or upload to cloud storage
   - Include photo URLs in API sync

2. **Detailed Trainer Info**
   - Trainer bio/description
   - Certifications
   - Years of experience
   - Trainer photo
   - Social media links (if available)

3. **Facility Amenities**
   - Shower facilities
   - Locker rooms
   - Equipment quality
   - Parking availability
   - Wi-Fi
   - Childcare

4. **User Reviews** (from provider sites)
   - Scrape existing reviews if available
   - Rating scores
   - Review text
   - Review date
   - Reviewer name (anonymous)

5. **Real-Time Availability**
   - Current spots available
   - Waitlist status
   - Booking status (open/closed/full)
   - Last updated timestamp

6. **Pricing Details**
   - Drop-in price
   - Package pricing
   - Intro offers
   - Membership pricing
   - Price change tracking

### Implementation

- Update existing provider adapters (Mindbody, Equinox, ClassPass)
- Add extraction methods for each data type
- Update database schema to store new fields
- Enhance sync to backend with new data

### Database Schema Updates

**classes table additions**:
- photos (JSON array of URLs)
- amenities (JSON array)
- real_time_availability (INT)
- booking_status (ENUM)
- last_availability_check (TIMESTAMP)

**trainers table additions**:
- bio (TEXT)
- certifications (JSON array)
- years_experience (INT)
- social_links (JSON)

**reviews table** (new):
- id
- class_id
- provider
- rating
- review_text
- review_date
- created_at

### API Sync Enhancement

Update backend sync to include new fields in POST requests.

## ✅ ACCEPTANCE CRITERIA

- [ ] All 3 existing providers extract photos
- [ ] Trainer bios scraped
- [ ] Amenities data captured
- [ ] Real-time availability checked
- [ ] Pricing details extracted
- [ ] Reviews scraped (if available)
- [ ] Database schema updated
- [ ] Backend sync includes new data
- [ ] All providers tested
- [ ] Documentation updated

## 📝 DELIVERABLES

- Enhanced provider adapters
- Database migration scripts
- Updated sync logic
- Tests
- Documentation

## 🚀 COMPLETION

1. Test: `npm test`
2. Build: `npm run build`
3. Create `.task-enhanced-data-completed`
4. Commit: "Add enhanced data extraction (photos, amenities, reviews)"
5. Push: `git push -u origin claude/add-enhanced-data`

---

**Est. Time**: 60-75 min | **Priority**: MEDIUM
