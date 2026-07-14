# RizeON — Mobile (React Native + Expo)

A futuristic, dark-mode mobile app for booking a single **shared physical court**
("Main Court") for **basketball** or **tennis**, plus coaches and weekly repeats.
Real React Native — **not** a WebView.

> Mobile application for RizeON court booking and operations.

## Stack

- **Expo SDK 56** · React Native 0.85 · React 19 · TypeScript
- **Expo Router** (file-based, bottom tabs)
- **NativeWind** (Tailwind-style) + per-component design tokens
- **Zustand** state management
- **AsyncStorage** local persistence (behind a swappable `storageService`)
- **React Hook Form + Zod** (auth form)
- **date-fns** date/time
- **lucide-react-native** icons · **expo-linear-gradient** gradients
- **react-native-reanimated** animations

## Run

```bash
cd mobile
npm install        # already installed if node_modules is present
npx expo start     # press a for Android, i for iOS, or scan the QR with Expo Go
```

Requires the **Expo Go** app on your phone, or an Android/iOS simulator.

For launch preparation beyond Expo Go, use `PRODUCTION_READINESS.md`.
For database backup and emergency recovery, use `supabase/BACKUP_RECOVERY.md`.

## The one critical rule

There is **one** physical court. Basketball and tennis are just _modes_ that change
the price ($30/hr vs $20/hr). A confirmed booking in either sport blocks the Main
Court for **both**. This is enforced in `src/utils/conflictUtils.ts` →
`hasCourtConflict`, which ignores sport entirely and only checks the shared court.

## What you can do

Create an account or sign in with email and password → book the Main Court for basketball or tennis →
watch a basketball slot block tennis at the same time → book a coach (optionally
reserving the Main Court) → repeat weekly (2/4/8 weeks, unavailable dates are
skipped and reported) → cancel bookings → view rules → browse coming-soon memberships.

Bookings, coaches, operating hours, pricing, and account data are loaded from the
configured Supabase project.

## Architecture (backend-ready)

All booking logic lives in services/utils, not the UI:

```
src/
  app/                 Expo Router screens
    index.tsx          Splash (animated) -> onboarding / auth / home
    onboarding.tsx     3 slides + Skip / Get Started
    auth.tsx           Email/password authentication (RHF + Zod)
    (tabs)/            home · book · coaches · bookings · profile
    rules.tsx  memberships.tsx
  components/          GlassCard, SportModeCard, MainCourtCard, CoachCard,
                       DateSelector, TimeSlotPicker, DurationSelector,
                       PriceSummaryCard, BookingCard, StatusBadge, EmptyState,
                       PrimaryGradientButton, ConfirmationModal, ErrorBanner,
                       ScreenContainer
  constants/           colors.ts (palette + sport accents), prices.ts (rules)
  data/                seedData.ts
  models/              index.ts (all domain types)
  store/               useAppStore.ts (Zustand)
  services/            bookingService.ts, storageService.ts
  utils/               dateUtils.ts, conflictUtils.ts
```

To move to the production stack (NestJS + Postgres + Redis), replace the bodies of
`services/storageService.ts` (and the create/cancel calls in `services/bookingService.ts`)
with API calls. The store, components, and screens stay unchanged. The conflict
functions mirror the SQL you'd run server-side with a Redis lock around the slot.

## Notes

- No payment / checkout — prices are display-only, per the spec.
- Single location, single court, no in-app admin — by design.
- On a note about storage: AsyncStorage is used (more reliable than a raw `.db`
  file in Expo Go and dependency-free). The `storageService` abstraction means you
  could swap in `expo-sqlite` or the real API later without touching the UI.

```



```
