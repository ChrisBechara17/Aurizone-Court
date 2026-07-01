import { Booking, User } from '@/models';
import { DEMO_USER_ID } from '@/data/seedData';

/**
 * Full customer roster for the admin views: the demo account (which holds the
 * seeded history) plus the seeded customers. The demo entry reflects the live
 * logged-in user when that's the demo account.
 */
export function buildRoster(users: User[], currentUser: User | null): User[] {
  const isDemoLoggedIn = currentUser?.id === DEMO_USER_ID;
  const demo: User = {
    id: DEMO_USER_ID,
    name: isDemoLoggedIn && currentUser?.name ? currentUser.name : 'Demo User',
    phoneOrEmail: isDemoLoggedIn ? currentUser!.phoneOrEmail : 'demo@courthub.com',
    isAdmin: !!(isDemoLoggedIn && currentUser?.isAdmin),
  };
  return [demo, ...users];
}

export const bookingsFor = (bookings: Booking[], userId: string) =>
  bookings.filter((b) => b.userId === userId);
