import { Booking } from '@/models';

/** Bookings belonging to a specific user. */
export const bookingsFor = (bookings: Booking[], userId: string) =>
  bookings.filter((b) => b.userId === userId);
