import { FitnessClass, TrainerInfo, Amenity, PricingDetails } from '../models/FitnessClass.js';

describe('Enhanced Data Features', () => {
  describe('FitnessClass with enhanced fields', () => {
    it('should support photo URLs', () => {
      const fitnessClass: Partial<FitnessClass> = {
        name: 'Test Class',
        photos: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg']
      };

      expect(fitnessClass.photos).toBeDefined();
      expect(fitnessClass.photos?.length).toBe(2);
    });

    it('should support trainer info', () => {
      const trainerInfo: TrainerInfo = {
        name: 'John Doe',
        bio: 'Experienced trainer',
        certifications: ['CPT', 'Yoga RYT-200'],
        yearsExperience: 5,
        photoUrl: 'https://example.com/trainer.jpg'
      };

      const fitnessClass: Partial<FitnessClass> = {
        name: 'Test Class',
        trainer: 'John Doe',
        trainerInfo
      };

      expect(fitnessClass.trainerInfo).toBeDefined();
      expect(fitnessClass.trainerInfo?.certifications).toContain('CPT');
    });

    it('should support amenities', () => {
      const amenities: Amenity[] = [
        { type: 'shower', available: true },
        { type: 'locker', available: true },
        { type: 'parking', available: true, description: 'Free parking' }
      ];

      const fitnessClass: Partial<FitnessClass> = {
        name: 'Test Class',
        amenities
      };

      expect(fitnessClass.amenities).toBeDefined();
      expect(fitnessClass.amenities?.length).toBe(3);
    });

    it('should support real-time availability', () => {
      const fitnessClass: Partial<FitnessClass> = {
        name: 'Test Class',
        realTimeAvailability: 5,
        bookingStatus: 'open',
        lastAvailabilityCheck: new Date()
      };

      expect(fitnessClass.realTimeAvailability).toBe(5);
      expect(fitnessClass.bookingStatus).toBe('open');
      expect(fitnessClass.lastAvailabilityCheck).toBeInstanceOf(Date);
    });

    it('should support pricing details', () => {
      const pricingDetails: PricingDetails = {
        dropIn: 25,
        packages: [
          { name: '5 classes', price: 100, classes: 5 },
          { name: '10 classes', price: 180, classes: 10 }
        ],
        introOffer: { description: 'First class free', price: 0 },
        membership: { monthly: 150, description: 'Unlimited classes' }
      };

      const fitnessClass: Partial<FitnessClass> = {
        name: 'Test Class',
        price: 25,
        pricingDetails
      };

      expect(fitnessClass.pricingDetails).toBeDefined();
      expect(fitnessClass.pricingDetails?.packages?.length).toBe(2);
      expect(fitnessClass.pricingDetails?.membership?.monthly).toBe(150);
    });

    it('should support all booking statuses', () => {
      const statuses: Array<'open' | 'closed' | 'full' | 'waitlist'> = ['open', 'closed', 'full', 'waitlist'];

      statuses.forEach(status => {
        const fitnessClass: Partial<FitnessClass> = {
          name: 'Test Class',
          bookingStatus: status
        };

        expect(fitnessClass.bookingStatus).toBe(status);
      });
    });
  });
});
