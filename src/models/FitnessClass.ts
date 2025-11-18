export interface Location {
  name: string;
  address: string;
  lat: number;
  long: number;
}

export interface TrainerInfo {
  name: string;
  bio?: string;
  certifications?: string[];
  yearsExperience?: number;
  photoUrl?: string;
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
    website?: string;
  };
}

export interface Amenity {
  type: string; // shower, locker, parking, wifi, childcare, equipment
  available: boolean;
  description?: string;
}

export interface Review {
  rating: number; // 1-5
  text?: string;
  date: Date;
  reviewerName?: string;
}

export interface PricingDetails {
  dropIn?: number;
  packages?: Array<{
    name: string;
    price: number;
    classes: number;
  }>;
  introOffer?: {
    description: string;
    price: number;
  };
  membership?: {
    monthly: number;
    description?: string;
  };
}

export interface FitnessClass {
  name: string;
  description: string;
  datetime: Date;
  location: Location;
  trainer: string; // Keep for backward compatibility
  trainerInfo?: TrainerInfo; // Enhanced trainer details
  intensity: number; // 1-10
  price: number; // Keep for backward compatibility
  pricingDetails?: PricingDetails; // Enhanced pricing
  bookingUrl: string;
  providerId: string;
  providerName: string;
  capacity: number;
  tags: string[]; // yoga, hiit, spin, pilates, etc.
  // Enhanced fields
  photos?: string[]; // Array of photo URLs
  amenities?: Amenity[];
  realTimeAvailability?: number; // Current spots available
  bookingStatus?: 'open' | 'closed' | 'full' | 'waitlist';
  lastAvailabilityCheck?: Date;
  reviews?: Review[];
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
