import { logger } from './logger.js';

export interface GeocodeResult {
  lat: number;
  long: number;
  formattedAddress: string;
}

/**
 * Geocode an address to latitude/longitude coordinates
 * Uses OpenStreetMap's Nominatim API (free, no API key required)
 *
 * Note: For production use, consider:
 * - Google Maps Geocoding API (requires API key)
 * - Mapbox Geocoding API (requires API key)
 * - Adding caching to avoid redundant API calls
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  try {
    // Encode the address for URL
    const encodedAddress = encodeURIComponent(address);

    // Use Nominatim (OpenStreetMap) - respecting usage policy with user agent
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'numina-scrapers/1.0'
      }
    });

    if (!response.ok) {
      logger.error(`Geocoding API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      logger.warn(`No geocoding results found for address: ${address}`);
      return null;
    }

    const result = data[0];
    return {
      lat: parseFloat(result.lat),
      long: parseFloat(result.lon),
      formattedAddress: result.display_name
    };

  } catch (error) {
    logger.error(`Geocoding error for address "${address}":`, error);
    return null;
  }
}

/**
 * Add delay between geocoding requests to respect API rate limits
 * Nominatim allows 1 request per second
 */
export async function geocodeWithRateLimit(address: string): Promise<GeocodeResult | null> {
  const result = await geocodeAddress(address);
  // Wait 1 second before next request
  await new Promise(resolve => setTimeout(resolve, 1000));
  return result;
}

/**
 * Batch geocode multiple addresses with rate limiting
 */
export async function geocodeBatch(addresses: string[]): Promise<Map<string, GeocodeResult>> {
  const results = new Map<string, GeocodeResult>();

  for (const address of addresses) {
    const result = await geocodeWithRateLimit(address);
    if (result) {
      results.set(address, result);
    }
  }

  return results;
}

/**
 * Parse coordinates from various text formats
 */
export function parseCoordinates(text: string): { lat: number; long: number } | null {
  // Try to match patterns like "37.7749,-122.4194" or "37.7749, -122.4194"
  const coordPattern = /(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/;
  const match = text.match(coordPattern);

  if (match) {
    const lat = parseFloat(match[1]);
    const long = parseFloat(match[2]);

    if (lat >= -90 && lat <= 90 && long >= -180 && long <= 180) {
      return { lat, long };
    }
  }

  return null;
}
