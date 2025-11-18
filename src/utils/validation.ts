import { FitnessClass } from '../models/FitnessClass.js';

export function validateFitnessClass(classData: any): classData is FitnessClass {
  if (!classData || typeof classData !== 'object') {
    return false;
  }

  // Required string fields
  const requiredStrings = ['name', 'description', 'trainer', 'bookingUrl', 'providerId', 'providerName'];
  for (const field of requiredStrings) {
    if (typeof classData[field] !== 'string' || !classData[field]) {
      return false;
    }
  }

  // Validate datetime
  if (!(classData.datetime instanceof Date) && typeof classData.datetime !== 'string') {
    return false;
  }

  // Validate location
  if (!classData.location || typeof classData.location !== 'object') {
    return false;
  }
  const { name, address, lat, long } = classData.location;
  if (typeof name !== 'string' || typeof address !== 'string') {
    return false;
  }
  if (typeof lat !== 'number' || typeof long !== 'number') {
    return false;
  }
  if (lat < -90 || lat > 90 || long < -180 || long > 180) {
    return false;
  }

  // Validate intensity (1-10)
  if (typeof classData.intensity !== 'number' || classData.intensity < 1 || classData.intensity > 10) {
    return false;
  }

  // Validate price
  if (typeof classData.price !== 'number' || classData.price < 0) {
    return false;
  }

  // Validate capacity
  if (typeof classData.capacity !== 'number' || classData.capacity < 0) {
    return false;
  }

  // Validate tags
  if (!Array.isArray(classData.tags)) {
    return false;
  }
  if (!classData.tags.every((tag: any) => typeof tag === 'string')) {
    return false;
  }

  return true;
}

export function sanitizeString(str: string): string {
  return str.trim().replace(/\s+/g, ' ');
}

export function parseIntensity(text: string): number {
  // Try to parse intensity from text like "High", "Medium", "Low"
  const lowerText = text.toLowerCase();
  if (lowerText.includes('high') || lowerText.includes('intense') || lowerText.includes('advanced')) {
    return 8;
  }
  if (lowerText.includes('medium') || lowerText.includes('moderate') || lowerText.includes('intermediate')) {
    return 5;
  }
  if (lowerText.includes('low') || lowerText.includes('beginner') || lowerText.includes('gentle')) {
    return 3;
  }
  // Default medium intensity
  return 5;
}

export function parseTags(text: string): string[] {
  const tags: string[] = [];
  const lowerText = text.toLowerCase();

  // Common class types
  const tagMap: Record<string, string> = {
    'yoga': 'yoga',
    'pilates': 'pilates',
    'spin': 'spin',
    'cycling': 'cycling',
    'hiit': 'hiit',
    'circuit': 'circuit',
    'strength': 'strength',
    'weights': 'weights',
    'cardio': 'cardio',
    'boxing': 'boxing',
    'kickboxing': 'kickboxing',
    'barre': 'barre',
    'dance': 'dance',
    'zumba': 'zumba',
    'bootcamp': 'bootcamp',
    'crossfit': 'crossfit',
    'martial arts': 'martial-arts',
    'swimming': 'swimming',
    'aqua': 'aqua',
    'stretching': 'stretching',
    'core': 'core',
    'abs': 'abs',
    'running': 'running',
    'rowing': 'rowing'
  };

  for (const [keyword, tag] of Object.entries(tagMap)) {
    if (lowerText.includes(keyword)) {
      tags.push(tag);
    }
  }

  return Array.from(new Set(tags)); // Remove duplicates
}
