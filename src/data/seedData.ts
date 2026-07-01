import {
  Booking,
  Coach,
  Court,
  CourtBlock,
  CourtRule,
  MembershipPackage,
  SportType,
  User,
} from '@/models';
import { addDays, startOfDay } from 'date-fns';

export const DEMO_USER_ID = 'demo-user';

// Demo customer roster (so the admin Users page has people to manage).
export const SEED_USERS: User[] = [
  { id: 'u-sara', name: 'Sara Haddad', phoneOrEmail: 'sara@email.com', isAdmin: false },
  { id: 'u-omar', name: 'Omar Nasser', phoneOrEmail: '+1 (555) 332-1180', isAdmin: false },
  { id: 'u-lina', name: 'Lina Khoury', phoneOrEmail: 'lina@email.com', isAdmin: false },
  { id: 'u-tariq', name: 'Tariq Aziz', phoneOrEmail: '+1 (555) 901-7745', isAdmin: false },
];
export const MAIN_COURT_ID = 'main-court';

export const MAIN_COURT: Court = {
  id: MAIN_COURT_ID,
  name: 'Main Court',
  supportedSports: ['basketball', 'tennis'],
  isActive: true,
};

export const COACHES: Coach[] = [
  {
    id: 'coach-karim',
    name: 'Coach Karim',
    supportedSports: ['basketball'],
    bio: 'Shooting, footwork, and game IQ',
    pricePerHour: 25,
    phone: '+1 (555) 014-2231',
    isActive: true,
    rating: 4.8,
  },
  {
    id: 'coach-maya',
    name: 'Coach Maya',
    supportedSports: ['tennis'],
    bio: 'Beginner to advanced tennis development',
    pricePerHour: 30,
    phone: '+1 (555) 087-5567',
    isActive: true,
    rating: 4.9,
  },
  {
    id: 'coach-jad',
    name: 'Coach Jad',
    supportedSports: ['basketball', 'tennis'],
    bio: 'Multi-sport private training',
    pricePerHour: 35,
    phone: '+1 (555) 203-9912',
    isActive: true,
    rating: 4.7,
  },
];

export const COURT_RULES: CourtRule[] = [
  { id: 'r1', title: 'Maximum booking duration', content: 'Sessions can be booked for up to 3 hours. Longer bookings are not allowed.' },
  { id: 'r2', title: 'One shared court', content: 'The Main Court is shared between basketball and tennis. There is only one physical court.' },
  { id: 'r3', title: 'Basketball blocks tennis', content: 'A basketball booking blocks tennis during the same time slot.' },
  { id: 'r4', title: 'Tennis blocks basketball', content: 'A tennis booking blocks basketball during the same time slot.' },
  { id: 'r5', title: 'Arrive early', content: 'Please arrive 10 minutes before your slot to warm up and start on time.' },
  { id: 'r6', title: 'Cancel if you can’t attend', content: 'Cancel your booking in advance so the slot can be freed for other players.' },
  { id: 'r7', title: 'Respect court timing', content: 'Vacate the court promptly at the end of your slot.' },
  { id: 'r8', title: 'Proper shoes required', content: 'Non-marking court shoes are required at all times.' },
  { id: 'r9', title: 'No food inside the court', content: 'Food is not allowed on the playing surface. Water bottles are fine.' },
  { id: 'r10', title: 'Admin may cancel', content: 'Management may cancel bookings if needed for maintenance or events.' },
  { id: 'r11', title: 'Weather / outdoor policy', content: 'Outdoor sessions may be rescheduled in case of adverse weather. (Policy placeholder.)' },
];

export const MEMBERSHIPS: MembershipPackage[] = [
  { id: 'm1', name: '5-Session Tennis Package', description: 'Five tennis sessions at a discounted bundle rate.', sportType: 'tennis', isComingSoon: true },
  { id: 'm2', name: '10-Session Basketball Package', description: 'Ten basketball sessions for dedicated hoopers.', sportType: 'basketball', isComingSoon: true },
  { id: 'm3', name: 'Monthly Court Membership', description: 'Priority access to the Main Court all month long.', sportType: 'all', isComingSoon: true },
  { id: 'm4', name: 'Private Coaching Bundle', description: 'A bundle of private coaching sessions with our pros.', sportType: 'all', isComingSoon: true },
];

const isoAt = (base: Date, hour: number) => {
  const d = new Date(base);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

/** Example bookings generated relative to "now". */
export function seedBookings(): Booking[] {
  const today = startOfDay(new Date());

  return [
    {
      // Main Court basketball today at 8:00 PM -> blocks tennis at 8 PM today.
      // This is the user's single active reservation (one-booking-at-a-time rule).
      id: 'seed-bball-today',
      userId: DEMO_USER_ID,
      bookingType: 'court',
      sportType: 'basketball',
      courtId: MAIN_COURT_ID,
      coachId: null,
      usesMainCourt: true,
      startTime: isoAt(today, 20),
      endTime: isoAt(today, 21),
      durationMinutes: 60,
      totalPrice: 30,
      status: 'confirmed',
      isRecurring: false,
      recurrenceGroupId: null,
      createdAt: new Date().toISOString(),
      cancelledAt: null,
    },
    // Completed history so the loyalty free-session reward is demoable.
    ...seedHistory(),
    // Other customers' bookings (for the admin Users page).
    ...seedUserBookings(),
  ];
}

/** Build one court booking for a customer. */
function userBooking(
  suffix: string,
  userId: string,
  sport: SportType,
  dayOffset: number,
  hour: number,
  status: Booking['status'],
  noShow = false,
): Booking {
  const day = addDays(startOfDay(new Date()), dayOffset);
  return {
    id: `seed-${userId}-${suffix}`,
    userId,
    bookingType: 'court',
    sportType: sport,
    courtId: MAIN_COURT_ID,
    coachId: null,
    usesMainCourt: true,
    startTime: isoAt(day, hour),
    endTime: isoAt(day, hour + 1),
    durationMinutes: 60,
    totalPrice: sport === 'basketball' ? 30 : 20,
    status,
    isRecurring: false,
    recurrenceGroupId: null,
    createdAt: isoAt(day, 9),
    cancelledAt: status === 'cancelled' ? isoAt(day, 8) : null,
    noShow,
  };
}

/** Varied histories: good standing, warnings, a disabled account, a newcomer. */
function seedUserBookings(): Booking[] {
  return [
    // Sara — good standing, several completed + one upcoming.
    userBooking('1', 'u-sara', 'tennis', -4, 17, 'completed'),
    userBooking('2', 'u-sara', 'tennis', -9, 17, 'completed'),
    userBooking('3', 'u-sara', 'basketball', -14, 18, 'completed'),
    userBooking('4', 'u-sara', 'tennis', 2, 10, 'confirmed'),
    // Omar — 2 no-shows (warnings active).
    userBooking('1', 'u-omar', 'basketball', -3, 19, 'completed'),
    userBooking('2', 'u-omar', 'basketball', -6, 19, 'completed', true),
    userBooking('3', 'u-omar', 'basketball', -8, 19, 'completed', true),
    // Lina — 3 no-shows -> account disabled.
    userBooking('1', 'u-lina', 'tennis', -2, 16, 'completed', true),
    userBooking('2', 'u-lina', 'tennis', -5, 16, 'completed', true),
    userBooking('3', 'u-lina', 'tennis', -7, 16, 'completed', true),
    // Tariq — newcomer, a single completed session.
    userBooking('1', 'u-tariq', 'basketball', -10, 12, 'completed'),
  ];
}

/**
 * 11 completed past sessions -> 1 free session already earned (every 10 = 1),
 * with progress toward the next one. Alternates basketball/tennis.
 */
function seedHistory(): Booking[] {
  const today = startOfDay(new Date());
  return Array.from({ length: 11 }, (_, i) => {
    const day = addDays(today, -(i + 1) * 2); // spread over past weeks
    const sport = i % 2 === 0 ? 'basketball' : 'tennis';
    return {
      id: `seed-history-${i}`,
      userId: DEMO_USER_ID,
      bookingType: 'court' as const,
      sportType: sport as 'basketball' | 'tennis',
      courtId: MAIN_COURT_ID,
      coachId: null,
      usesMainCourt: true,
      startTime: isoAt(day, 18),
      endTime: isoAt(day, 19),
      durationMinutes: 60,
      totalPrice: sport === 'basketball' ? 30 : 20,
      status: 'completed' as const,
      isRecurring: false,
      recurrenceGroupId: null,
      createdAt: isoAt(day, 10),
      cancelledAt: null,
    };
  });
}

export const seedCourtBlocks: CourtBlock[] = [];
