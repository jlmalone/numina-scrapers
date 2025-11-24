import Database from 'better-sqlite3';

/**
 * Momence Public Readonly API Integration
 * Based on working implementation from delphi project
 *
 * API URL: https://readonly-api.momence.com/host-plugins/host/{HOST_ID}/host-schedule/sessions
 * No authentication required - public readonly API
 * Uses Node.js built-in fetch (Node 18+)
 */

const BASE_URL = 'https://readonly-api.momence.com/host-plugins/host';

// Known Momence Studios (need to find more NYC studios)
const STUDIOS = [
  {
    hostId: '23168',
    name: 'Alchemy Yoga & Meditation Center',
    location: 'Ubud, Bali, Indonesia',
    type: 'yoga'
  }
  // TODO: Find NYC studios using Momence
  // Examples to research:
  // - Sky Ting Yoga NYC
  // - The Yoga Collective NYC
  // - Strala Yoga NYC
];

const SESSION_TYPES = [
  'course-class',
  'fitness',
  'retreat',
  'special-event',
  'special-event-new'
];

function buildUrl(hostId, fromDate, toDate = null, pageSize = 100, page = 0) {
  const url = new URL(`${BASE_URL}/${hostId}/host-schedule/sessions`);

  // Add session types as array parameters
  SESSION_TYPES.forEach(type => {
    url.searchParams.append('sessionTypes[]', type);
  });

  url.searchParams.append('fromDate', fromDate);
  if (toDate) url.searchParams.append('toDate', toDate);
  url.searchParams.append('pageSize', pageSize.toString());
  url.searchParams.append('page', page.toString());

  return url.toString();
}

async function fetchClasses(hostId, fromDate, toDate = null, fetchAllPages = true) {
  const allClasses = [];
  let page = 0;
  const pageSize = 100;

  try {
    do {
      const url = buildUrl(hostId, fromDate, toDate, pageSize, page);
      console.log(`   Fetching page ${page + 1}...`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.payload || !Array.isArray(data.payload)) {
        console.error('   ⚠️  Unexpected API response structure');
        break;
      }

      allClasses.push(...data.payload);

      const totalPages = Math.ceil(data.pagination.totalCount / pageSize);
      console.log(`   Found ${data.payload.length} classes (page ${page + 1}/${totalPages})`);

      page++;

      if (!fetchAllPages) break;
      if (page >= totalPages) break;

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 500));

    } while (true);

  } catch (error) {
    console.error(`   ❌ Error fetching classes: ${error.message}`);
  }

  return allClasses;
}

function transformToNuminaFormat(classData, studioInfo) {
  return {
    provider: studioInfo.name,
    name: classData.sessionName,
    description: classData.level || classData.description || '',
    classType: classData.type,
    startTime: classData.startsAt,
    endTime: classData.endsAt,
    duration: calculateDuration(classData.startsAt, classData.endsAt),
    price: classData.cost || 0,
    location: classData.location || studioInfo.location,
    instructor: classData.teacher || 'TBA',
    instructorPhoto: classData.teacherPicture || null,
    imageUrl: classData.image || null,
    bookingUrl: `https://momence.com/s/${classData.id}`,
    isCancelled: classData.isCancelled || false,
    sourceUrl: `https://readonly-api.momence.com/host/${studioInfo.hostId}`,
    externalId: classData.id.toString(),
    source: 'momence-api'
  };
}

function calculateDuration(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return Math.round((end - start) / (1000 * 60)); // Duration in minutes
}

function storeInDatabase(classes) {
  if (classes.length === 0) {
    console.log('\n⚠️  No classes to store');
    return;
  }

  console.log(`\n💾 Storing ${classes.length} classes in database...`);

  const db = new Database('/Users/josephmalone/IdeaProjects/numina-scrapers/numina-scrapers.db');

  // Create table with full schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS momence_classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE,
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      class_type TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration INTEGER,
      price REAL,
      location TEXT,
      instructor TEXT,
      instructor_photo TEXT,
      image_url TEXT,
      booking_url TEXT,
      is_cancelled INTEGER DEFAULT 0,
      source_url TEXT,
      source TEXT DEFAULT 'momence-api',
      scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const insert = db.prepare(`
    INSERT OR REPLACE INTO momence_classes (
      external_id, provider, name, description, class_type,
      start_time, end_time, duration, price, location,
      instructor, instructor_photo, image_url, booking_url,
      is_cancelled, source_url, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((classes) => {
    for (const cls of classes) {
      insert.run(
        cls.externalId, cls.provider, cls.name, cls.description, cls.classType,
        cls.startTime, cls.endTime, cls.duration, cls.price, cls.location,
        cls.instructor, cls.instructorPhoto, cls.imageUrl, cls.bookingUrl,
        cls.isCancelled ? 1 : 0, cls.sourceUrl, cls.source
      );
    }
  });

  try {
    insertMany(classes);
    console.log('✅ Stored successfully!');

    // Show sample
    const sample = db.prepare('SELECT * FROM momence_classes LIMIT 3').all();
    console.log('\n📋 Sample data:');
    sample.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.name} - ${row.instructor} (${row.start_time})`);
    });
  } catch (error) {
    console.error(`❌ Database error: ${error.message}`);
  } finally {
    db.close();
  }
}

// Main execution
(async () => {
  console.log('🎯 Fetching REAL data from Momence API...\n');
  console.log('   API: https://readonly-api.momence.com');
  console.log('   Type: Public Readonly (no auth required)\n');

  const allClasses = [];

  // Get classes for the next 7 days
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const fromDate = today.toISOString();
  const toDate = nextWeek.toISOString();

  for (const studio of STUDIOS) {
    console.log(`\n📍 ${studio.name}`);
    console.log(`   Host ID: ${studio.hostId}`);
    console.log(`   Location: ${studio.location}\n`);

    const classes = await fetchClasses(studio.hostId, fromDate, toDate, true);

    if (classes.length > 0) {
      console.log(`   ✅ Found ${classes.length} classes`);

      // Transform to Numina format
      const transformed = classes.map(cls => transformToNuminaFormat(cls, studio));
      allClasses.push(...transformed);

      // Show sample
      console.log(`\n   Sample classes:`);
      classes.slice(0, 3).forEach((cls, i) => {
        console.log(`   ${i + 1}. ${cls.sessionName} - ${cls.teacher || 'TBA'}`);
        console.log(`      ${new Date(cls.startsAt).toLocaleString()}`);
      });
    } else {
      console.log(`   ⚠️  No classes found`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n\n=== SUMMARY ===');
  console.log(`Total studios checked: ${STUDIOS.length}`);
  console.log(`Total classes fetched: ${allClasses.length}`);

  if (allClasses.length > 0) {
    storeInDatabase(allClasses);
  }

  console.log('\n📋 Database: numina-scrapers.db');
  console.log('📊 Table: momence_classes');
  console.log('\n💡 Next Steps:');
  console.log('   1. Find NYC studios using Momence (need host IDs)');
  console.log('   2. Add more studios to the STUDIOS array');
  console.log('   3. Configure backend to read from momence_classes table');
})();
