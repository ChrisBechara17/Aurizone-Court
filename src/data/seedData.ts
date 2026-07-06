import { Coach, CourtRule, MembershipPackage } from '@/models';

// ---------------------------------------------------------------------------
// Static reference content shown in the UI. Live data (users, bookings,
// coaches, court blocks) now comes from Supabase — see supabaseService.ts.
//
// COACHES here is only a fallback name lookup for legacy coach bookings; the
// real coach directory is loaded from the database.
// COURT_RULES and MEMBERSHIPS are static display content.
// ---------------------------------------------------------------------------

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
