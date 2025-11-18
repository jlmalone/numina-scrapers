export interface Location {
  name: string;
  address: string;
  lat: number;
  long: number;
}

export interface FitnessClass {
  name: string;
  description: string;
  datetime: Date;
  location: Location;
  trainer: string;
  intensity: number; // 1-10
  price: number;
  bookingUrl: string;
  providerId: string;
  providerName: string;
  capacity: number;
  tags: string[]; // yoga, hiit, spin, pilates, etc.
}

export interface ScrapeOptions {
  startDate?: Date;
  endDate?: Date;
  location?: string;
  maxResults?: number;
}

export interface ScrapeResult {
  provider: string;
  success: boolean;
  classesFound: number;
  classes: FitnessClass[];
  errors: string[];
  timestamp: Date;
}
