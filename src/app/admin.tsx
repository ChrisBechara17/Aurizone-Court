import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleProp, Text, TextInput, TextStyle, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Activity, ArrowLeft, ArrowDown, ArrowUp, Ban, Bell, CalendarDays, CalendarRange, ChevronDown, ChevronUp, Clock, Download, DollarSign, GraduationCap, LayoutGrid, Megaphone, Pencil, Phone, Plus, RefreshCw, ScrollText, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { BookingCard } from '@/components/BookingCard';
import { CoachCard } from '@/components/CoachCard';
import { DateSelector } from '@/components/DateSelector';
import { TimeSlotPicker } from '@/components/TimeSlotPicker';
import { DurationSelector } from '@/components/DurationSelector';
import { PrimaryGradientButton } from '@/components/PrimaryGradientButton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';
import { AdminTabBar, AdminTabDef } from '@/components/admin/AdminTabBar';
import { UserRosterList } from '@/components/admin/UserRosterList';
import { COLORS, sportLabel } from '@/constants/colors';
import { Booking, CourtBlock, LoyaltyTierKey, OperatingHour, SportType } from '@/models';
import { useAppStore } from '@/store/useAppStore';
import {
  calculateEndTime,
  combineDateAndTime,
  fitsWithinOperatingHours,
  fmtDate,
  fmtTime,
  isSameDay,
  operatingHoursForDate,
  startOfDay,
  timeSlotsForOperatingHours,
} from '@/utils/dateUtils';
import { hasCourtConflict } from '@/utils/conflictUtils';
import { parseISO } from 'date-fns';
import { computeLoyalty, computeLoyaltyFromTransactions } from '@/utils/loyalty';
import { computeStanding } from '@/utils/accountStanding';
import { shareCsv } from '@/utils/csvExport';
import { bookingsFor } from '@/utils/adminUsers';

type AdminTab = 'overview' | 'schedule' | 'bookings' | 'pricing' | 'coaches' | 'rules' | 'users' | 'audit' | 'health';
type AdminGroup = 'operations' | 'business' | 'people' | 'system';
type RevenueRange = 'today' | 'week' | 'month' | 'all';

const ADMIN_TABS: AdminTabDef<AdminTab>[] = [
  { key: 'overview', label: 'Overview', Icon: LayoutGrid },
  { key: 'schedule', label: 'Schedule', Icon: CalendarRange },
  { key: 'bookings', label: 'Bookings', Icon: CalendarDays },
  { key: 'pricing', label: 'Pricing', Icon: DollarSign },
  { key: 'coaches', label: 'Coaches', Icon: Megaphone },
  { key: 'rules', label: 'Rules', Icon: ScrollText },
  { key: 'users', label: 'Users', Icon: Users },
  { key: 'audit', label: 'Audit', Icon: ShieldCheck },
  { key: 'health', label: 'Health', Icon: Activity },
];

const ADMIN_GROUPS: { key: AdminGroup; label: string; tabs: AdminTab[] }[] = [
  { key: 'operations', label: 'Operations', tabs: ['overview', 'schedule', 'bookings'] },
  { key: 'business', label: 'Business', tabs: ['pricing'] },
  { key: 'people', label: 'People', tabs: ['users', 'coaches'] },
  { key: 'system', label: 'System', tabs: ['rules', 'audit', 'health'] },
];

const REQUIRED_MIGRATIONS = [
  { key: 'schema.sql', label: 'Base schema' },
  { key: 'policies.sql', label: 'RLS policies' },
  { key: 'pricing.sql', label: 'Pricing' },
  { key: 'business-controls.sql', label: 'Business controls' },
  { key: 'operations-upgrades.sql', label: 'Operations upgrades' },
  { key: 'harden-security.sql', label: 'Security hardening' },
  { key: 'push-readiness.sql', label: 'Push readiness' },
  { key: 'schema-migrations.sql', label: 'Migration tracking' },
];

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Admin gold accent + input style are read live from the palette (inside the
// component bodies) so the console follows the active light/dark theme.
const inputStyleFor = () =>
  ({
    backgroundColor: COLORS.chip,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: COLORS.text,
    fontSize: 15,
  }) as const;

export default function AdminScreen() {
  const ADMIN = COLORS.warning;
  const inputStyle = inputStyleFor();
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const refresh = useAppStore((s) => s.refresh);
  const lastRefreshedAt = useAppStore((s) => s.lastRefreshedAt);
  const refreshError = useAppStore((s) => s.refreshError);
  const bookings = useAppStore((s) => s.bookings);
  const occupancy = useAppStore((s) => s.occupancy);
  const courtBlocks = useAppStore((s) => s.courtBlocks);
  const addCourtBlock = useAppStore((s) => s.addCourtBlock);
  const removeCourtBlock = useAppStore((s) => s.removeCourtBlock);
  const bookCoachSession = useAppStore((s) => s.bookCoachSession);
  const coaches = useAppStore((s) => s.coaches);
  const addCoach = useAppStore((s) => s.addCoach);
  const updateCoach = useAppStore((s) => s.updateCoach);
  const removeCoach = useAppStore((s) => s.removeCoach);
  const users = useAppStore((s) => s.users);
  const pricing = useAppStore((s) => s.pricing);
  const updatePricing = useAppStore((s) => s.updatePricing);
  const loyaltySettings = useAppStore((s) => s.loyaltySettings);
  const updateLoyaltySettings = useAppStore((s) => s.updateLoyaltySettings);
  const tierPerks = useAppStore((s) => s.tierPerks);
  const updateTierPerks = useAppStore((s) => s.updateTierPerks);
  const supportPhone = useAppStore((s) => s.supportPhone);
  const setSupportPhone = useAppStore((s) => s.setSupportPhone);
  const operatingHours = useAppStore((s) => s.operatingHours);
  const updateOperatingHours = useAppStore((s) => s.updateOperatingHours);
  const courtRules = useAppStore((s) => s.courtRules);
  const addRule = useAppStore((s) => s.addRule);
  const updateRule = useAppStore((s) => s.updateRule);
  const removeRule = useAppStore((s) => s.removeRule);
  const reorderRule = useAppStore((s) => s.reorderRule);
  const auditLogs = useAppStore((s) => s.auditLogs);
  const notifications = useAppStore((s) => s.notifications);
  const loyaltyTransactions = useAppStore((s) => s.loyaltyTransactions);
  const schemaMigrations = useAppStore((s) => s.schemaMigrations);
  const pushStatus = useAppStore((s) => s.pushStatus);

  const [date, setDate] = useState<Date>(startOfDay(new Date()));
  const [time, setTime] = useState('12:00');
  const [duration, setDuration] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Coaching-session booking (admin books a coach into the selected slot).
  const [showCoach, setShowCoach] = useState(false);
  const [cbCoachId, setCbCoachId] = useState<string | null>(null);
  const [cbRepeatWeeks, setCbRepeatWeeks] = useState(1);
  const [cbErr, setCbErr] = useState<string | null>(null);
  const [cbOk, setCbOk] = useState<string | null>(null);

  // Which console section is showing (bottom-tab navigation).
  const [tab, setTab] = useState<AdminTab>('overview');
  const [scheduleWeek, setScheduleWeek] = useState<Date>(startOfDay(new Date()));
  const [scheduleFilters, setScheduleFilters] = useState({
    basketball: true,
    tennis: true,
    coach: true,
    blocks: true,
  });
  const [bookingStatusFilter, setBookingStatusFilter] = useState<'all' | 'upcoming' | 'completed' | 'cancelled' | 'no_show'>('all');
  const [bookingTypeFilter, setBookingTypeFilter] = useState<'all' | 'court' | 'coach'>('all');
  const [bookingSportFilter, setBookingSportFilter] = useState<'all' | SportType>('all');
  const [bookingSearch, setBookingSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [revenueRange, setRevenueRange] = useState<RevenueRange>('today');
  const [refreshing, setRefreshing] = useState(false);
  const [adminRefreshErr, setAdminRefreshErr] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);

  // Bookings day filter
  const [bookingsDay, setBookingsDay] = useState<Date>(startOfDay(new Date()));

  // Coach form (add / edit)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cName, setCName] = useState('');
  const [cSports, setCSports] = useState<SportType[]>(['basketball']);
  const [cBio, setCBio] = useState('');
  const [cPrice, setCPrice] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coachOk, setCoachOk] = useState<string | null>(null);

  // Pricing form — seeded from the loaded rates, re-seeded when they change.
  // Off-peak and peak columns for each court sport; ball machine is flat.
  const [pBasket, setPBasket] = useState(String(pricing.basketball));
  const [pBasketPeak, setPBasketPeak] = useState(String(pricing.basketballPeak));
  const [pHalf, setPHalf] = useState(String(pricing.basketballHalf));
  const [pHalfPeak, setPHalfPeak] = useState(String(pricing.basketballHalfPeak));
  const [pTennis, setPTennis] = useState(String(pricing.tennis));
  const [pTennisPeak, setPTennisPeak] = useState(String(pricing.tennisPeak));
  const [pMachine, setPMachine] = useState(String(pricing.ballMachineRate));
  const [pLoyaltyBooking, setPLoyaltyBooking] = useState(String(loyaltySettings.pointsPerBooking));
  const [pTierPerks, setPTierPerks] = useState<Record<LoyaltyTierKey, string>>({
    bronze: tierPerks.bronze.join('\n'),
    silver: tierPerks.silver.join('\n'),
    gold: tierPerks.gold.join('\n'),
    platinum: tierPerks.platinum.join('\n'),
  });
  const [priceErr, setPriceErr] = useState<string | null>(null);
  const [priceOk, setPriceOk] = useState<string | null>(null);
  const [hoursDraft, setHoursDraft] = useState<OperatingHour[]>(operatingHours);
  const [hoursErr, setHoursErr] = useState<string | null>(null);
  const [hoursOk, setHoursOk] = useState<string | null>(null);

  // Support / front-desk phone (shown to users who want to cancel).
  const [pSupport, setPSupport] = useState(supportPhone);
  const [supportErr, setSupportErr] = useState<string | null>(null);
  const [supportOk, setSupportOk] = useState<string | null>(null);
  useEffect(() => setPSupport(supportPhone), [supportPhone]);

  const onSaveSupport = async () => {
    setSupportErr(null);
    setSupportOk(null);
    const res = await setSupportPhone(pSupport);
    if (!res.ok) return setSupportErr(res.error ?? 'Could not update the support number.');
    setSupportOk('Support number updated. Users see this when they cancel.');
  };

  // Court rules form (add / edit)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [rTitle, setRTitle] = useState('');
  const [rContent, setRContent] = useState('');
  const [ruleErr, setRuleErr] = useState<string | null>(null);
  const [ruleOk, setRuleOk] = useState<string | null>(null);

  const resetRuleForm = () => {
    setEditingRuleId(null);
    setRTitle('');
    setRContent('');
  };

  const startEditRule = (id: string) => {
    const rule = courtRules.find((r) => r.id === id);
    if (!rule) return;
    setEditingRuleId(rule.id);
    setRTitle(rule.title);
    setRContent(rule.content);
    setRuleErr(null);
    setRuleOk(null);
  };

  const onSaveRule = async () => {
    setRuleErr(null);
    setRuleOk(null);
    const payload = { title: rTitle, content: rContent };
    const res = editingRuleId ? await updateRule(editingRuleId, payload) : await addRule(payload);
    if (!res.ok) return setRuleErr(res.error ?? 'Could not save rule.');
    setRuleOk(editingRuleId ? 'Rule updated.' : 'Rule added.');
    resetRuleForm();
  };

  const sortedRules = [...courtRules].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  useEffect(() => {
    setPBasket(String(pricing.basketball));
    setPBasketPeak(String(pricing.basketballPeak));
    setPHalf(String(pricing.basketballHalf));
    setPHalfPeak(String(pricing.basketballHalfPeak));
    setPTennis(String(pricing.tennis));
    setPTennisPeak(String(pricing.tennisPeak));
    setPMachine(String(pricing.ballMachineRate));
    setPLoyaltyBooking(String(loyaltySettings.pointsPerBooking));
    setPTierPerks({
      bronze: tierPerks.bronze.join('\n'),
      silver: tierPerks.silver.join('\n'),
      gold: tierPerks.gold.join('\n'),
      platinum: tierPerks.platinum.join('\n'),
    });
  }, [
    pricing.basketball,
    pricing.basketballPeak,
    pricing.basketballHalf,
    pricing.basketballHalfPeak,
    pricing.tennis,
    pricing.tennisPeak,
    pricing.ballMachineRate,
    loyaltySettings.pointsPerBooking,
    tierPerks,
  ]);

  useEffect(() => setHoursDraft(operatingHours), [operatingHours]);

  const onSavePricing = async () => {
    setPriceErr(null);
    setPriceOk(null);
    const res = await updatePricing({
      basketball: Number(pBasket) || 0,
      basketballPeak: Number(pBasketPeak) || 0,
      basketballHalf: Number(pHalf) || 0,
      basketballHalfPeak: Number(pHalfPeak) || 0,
      tennis: Number(pTennis) || 0,
      tennisPeak: Number(pTennisPeak) || 0,
      ballMachineRate: Number(pMachine) || 0,
    });
    if (!res.ok) return setPriceErr(res.error ?? 'Could not update pricing.');
    const loyaltyRes = await updateLoyaltySettings({
      ...loyaltySettings,
      pointsPerBooking: Number(pLoyaltyBooking) || 0,
    });
    if (!loyaltyRes.ok) return setPriceErr(loyaltyRes.error ?? 'Could not update loyalty settings.');
    const perksRes = await updateTierPerks({
      bronze: linesFromText(pTierPerks.bronze),
      silver: linesFromText(pTierPerks.silver),
      gold: linesFromText(pTierPerks.gold),
      platinum: linesFromText(pTierPerks.platinum),
    });
    if (!perksRes.ok) return setPriceErr(perksRes.error ?? 'Could not update tier rewards.');
    setPriceOk('Pricing and loyalty settings updated.');
  };

  const onSaveHours = async () => {
    setHoursErr(null);
    setHoursOk(null);
    for (const h of hoursDraft) {
      if (!h.isClosed && timeStringToMinutes(h.closeTime) <= timeStringToMinutes(h.openTime)) {
        return setHoursErr('Close time must be after open time for every open day.');
      }
    }
    const res = await updateOperatingHours(hoursDraft);
    if (!res.ok) return setHoursErr(res.error ?? 'Could not update operating hours.');
    setHoursOk('Operating hours updated.');
  };

  const toggleSport = (s: SportType) =>
    setCSports((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const resetCoachForm = () => {
    setEditingId(null);
    setCName('');
    setCBio('');
    setCPrice('');
    setCPhone('');
    setCSports(['basketball']);
  };

  const startEditCoach = (id: string) => {
    const coach = coaches.find((c) => c.id === id);
    if (!coach) return;
    setEditingId(coach.id);
    setCName(coach.name);
    setCSports(coach.supportedSports);
    setCBio(coach.bio);
    setCPrice(String(coach.pricePerHour));
    setCPhone(coach.phone);
    setCoachError(null);
    setCoachOk(null);
  };

  const onSaveCoach = async () => {
    setCoachError(null);
    setCoachOk(null);
    const payload = {
      name: cName,
      supportedSports: cSports,
      bio: cBio,
      pricePerHour: Number(cPrice) || 0,
      phone: cPhone,
    };
    const res = editingId ? await updateCoach(editingId, payload) : await addCoach(payload);
    if (!res.ok) {
      setCoachError(res.error ?? 'Could not save coach.');
      return;
    }
    setCoachOk(editingId ? `${cName.trim()} updated.` : `${cName.trim()} added.`);
    resetCoachForm();
  };

  const unavailable = useMemo(
    () => {
      const hours = operatingHoursForDate(operatingHours, date);
      return timeSlotsForOperatingHours(hours).filter((slot) => {
        if (!fitsWithinOperatingHours(slot, duration, hours)) return true;
        const start = combineDateAndTime(date, slot);
        const end = calculateEndTime(start, duration);
        return hasCourtConflict(
          { startTime: start.toISOString(), endTime: end.toISOString(), usesMainCourt: true },
          occupancy,
          courtBlocks,
        );
      });
    },
    [date, duration, occupancy, courtBlocks, operatingHours],
  );

  const adminDayHours = operatingHoursForDate(operatingHours, date);
  const adminDaySlots = useMemo(() => timeSlotsForOperatingHours(adminDayHours), [adminDayHours]);
  useEffect(() => {
    if (adminDaySlots.length > 0 && !adminDaySlots.includes(time)) setTime(adminDaySlots[0]);
  }, [adminDaySlots, time]);

  // Bookings for the selected day, sorted by start time.
  const dayBookings = useMemo(
    () =>
      bookings
        .filter((b) => isSameDay(parseISO(b.startTime), bookingsDay))
        .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime()),
    [bookings, bookingsDay],
  );

  const filteredDayBookings = useMemo(() => {
    const q = bookingSearch.trim().toLowerCase();
    return dayBookings.filter((b) => {
      const isUpcoming = b.status === 'confirmed' && parseISO(b.endTime).getTime() > Date.now();
      if (bookingStatusFilter === 'upcoming' && !isUpcoming) return false;
      if (bookingStatusFilter === 'completed' && b.status !== 'completed') return false;
      if (bookingStatusFilter === 'cancelled' && b.status !== 'cancelled') return false;
      if (bookingStatusFilter === 'no_show' && !b.noShow) return false;
      if (bookingTypeFilter !== 'all' && b.bookingType !== bookingTypeFilter) return false;
      if (bookingSportFilter !== 'all' && b.sportType !== bookingSportFilter) return false;
      if (!q) return true;
      const u = users.find((x) => x.id === b.userId);
      const haystack = `${u?.name ?? ''} ${u?.phoneOrEmail ?? ''} ${b.sportType} ${b.bookingType}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [dayBookings, bookingSearch, bookingStatusFilter, bookingTypeFilter, bookingSportFilter, users]);

  const revenue = useMemo(() => {
    const included = bookings.filter((b) =>
      !b.isFreeReward &&
      !b.noShow &&
      b.status !== 'cancelled' &&
      isInRevenueRange(parseISO(b.startTime), revenueRange)
    );
    const completed = included.filter((b) => b.status === 'completed');
    const expected = included.reduce((sum, b) => sum + b.totalPrice, 0);
    return {
      expected,
      completed: completed.reduce((sum, b) => sum + b.totalPrice, 0),
      count: included.length,
      basketball: included.filter((b) => b.sportType === 'basketball').reduce((sum, b) => sum + b.totalPrice, 0),
      tennis: included.filter((b) => b.sportType === 'tennis').reduce((sum, b) => sum + b.totalPrice, 0),
      coach: included.filter((b) => b.bookingType === 'coach').reduce((sum, b) => sum + b.totalPrice, 0),
    };
  }, [bookings, revenueRange]);

  const activeCourtBlocks = useMemo(
    () =>
      courtBlocks
        .filter((blk) => parseISO(blk.endTime).getTime() > Date.now())
        .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime()),
    [courtBlocks],
  );

  // S1: admin-only guard must come AFTER every hook. Returning before the
  // useMemos above would change the hook count when isAdmin flips while the
  // screen is mounted, violating the Rules of Hooks and crashing the app.
  if (!user?.isAdmin) return <Redirect href="/(tabs)/profile" />;

  const upcomingCount = bookings.filter(
    (b) => b.status === 'confirmed' && parseISO(b.endTime).getTime() > Date.now(),
  ).length;
  const userCount = users.length;

  // Resolve a booking's user name for the admin bookings view.
  const nameOf = (uid: string) => users.find((u) => u.id === uid)?.name ?? 'Unknown user';
  const activeTab = ADMIN_TABS.find((t) => t.key === tab);
  const activeGroup = ADMIN_GROUPS.find((g) => g.tabs.includes(tab)) ?? ADMIN_GROUPS[0];
  const visibleTabs = ADMIN_TABS.filter((t) => activeGroup.tabs.includes(t.key));
  const selectGroup = (group: AdminGroup) => {
    const next = ADMIN_GROUPS.find((g) => g.key === group);
    if (!next) return;
    if (!next.tabs.includes(tab)) setTab(next.tabs[0]);
  };

  const onRefreshAdmin = async () => {
    setAdminRefreshErr(null);
    setRefreshing(true);
    try {
      await refresh();
    } catch (e: any) {
      setAdminRefreshErr(e?.message ?? 'Could not refresh admin data.');
    } finally {
      setRefreshing(false);
    }
  };

  const onExportBookings = async () => {
    setExportErr(null);
    try {
      await shareCsv('rizeon-bookings.csv', bookings.map((b) => ({
        date: fmtDate(b.startTime),
        time: `${fmtTime(b.startTime)} - ${fmtTime(b.endTime)}`,
        type: b.bookingType,
        sport: b.sportType,
        user: nameOf(b.userId),
        status: b.status,
        total_price: b.totalPrice,
        coach: b.coachId ? coaches.find((c) => c.id === b.coachId)?.name ?? 'Coach' : '',
        no_show: !!b.noShow,
      })));
    } catch (e: any) {
      setExportErr(e?.message ?? 'Could not export bookings.');
    }
  };

  const onExportUsers = async () => {
    setExportErr(null);
    try {
      await shareCsv('rizeon-users.csv', users.map((u) => {
        const ub = bookingsFor(bookings, u.id);
        const txs = loyaltyTransactions.filter((tx) => tx.userId === u.id);
        const loyalty = txs.length > 0 ? computeLoyaltyFromTransactions(txs, ub) : computeLoyalty(ub, loyaltySettings);
        const standing = computeStanding(ub);
        return {
          name: u.name,
          phone_or_email: u.phoneOrEmail,
          admin: u.isAdmin,
          loyalty_tier: loyalty.tier.name,
          loyalty_points: loyalty.points,
          no_show_strikes: standing.strikes,
        };
      }));
    } catch (e: any) {
      setExportErr(e?.message ?? 'Could not export users.');
    }
  };

  const onExportRevenue = async () => {
    setExportErr(null);
    try {
      await shareCsv(`rizeon-revenue-${revenueRange}.csv`, [{
        period: revenueRange,
        expected: revenue.expected,
        completed: revenue.completed,
        basketball: revenue.basketball,
        tennis: revenue.tennis,
        coach: revenue.coach,
        booking_count: revenue.count,
      }]);
    } catch (e: any) {
      setExportErr(e?.message ?? 'Could not export revenue.');
    }
  };

  const onExportNoShows = async () => {
    setExportErr(null);
    try {
      await shareCsv('rizeon-no-shows.csv', bookings.filter((b) => b.noShow).map((b) => ({
        user: nameOf(b.userId),
        date: fmtDate(b.startTime),
        time: `${fmtTime(b.startTime)} - ${fmtTime(b.endTime)}`,
        type: b.bookingType,
        sport: b.sportType,
        reason: b.noShowReason ?? '',
        penalty: loyaltySettings.noShowPenalty,
      })));
    } catch (e: any) {
      setExportErr(e?.message ?? 'Could not export no-shows.');
    }
  };

  const onBlock = async () => {
    setError(null);
    setOkMsg(null);
    if (!fitsWithinOperatingHours(time, duration, adminDayHours)) {
      setError(adminDayHours.isClosed ? 'The court is closed that day.' : 'That block is outside operating hours.');
      return;
    }
    const res = await addCourtBlock({ date, startTime: time, durationHours: duration, reason });
    if (!res.ok) {
      setError(res.error ?? 'Could not block this time.');
      return;
    }
    setReason('');
    setOkMsg(`Blocked ${fmtDate(combineDateAndTime(date, time))} at ${fmtTime(combineDateAndTime(date, time))}.`);
  };

  const onBookCoach = async () => {
    setCbErr(null);
    setCbOk(null);
    if (!fitsWithinOperatingHours(time, duration, adminDayHours)) {
      setCbErr(adminDayHours.isClosed ? 'The court is closed that day.' : 'That session is outside operating hours.');
      return;
    }
    if (!cbCoachId) return setCbErr('Select a coach.');
    const res = await bookCoachSession({
      coachId: cbCoachId,
      userId: user.id,
      date,
      startTime: time,
      durationHours: duration,
      usesMainCourt: true,
      repeatCount: cbRepeatWeeks,
    });
    if (!res.ok) return setCbErr(res.error ?? 'Could not create the coaching booking.');
    const coach = coaches.find((c) => c.id === cbCoachId);
    const booked = res.createdCount ?? cbRepeatWeeks;
    const skipped = res.skippedCount ?? 0;
    setCbOk(
      `Booked ${booked} coaching session${booked === 1 ? '' : 's'}${coach ? ` with ${coach.name}` : ''}${
        skipped > 0 ? `; skipped ${skipped} unavailable.` : '.'
      }`,
    );
    setCbCoachId(null);
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110, gap: 18 }} showsVerticalScrollIndicator={false}>
        {/* Console banner */}
        <Animated.View entering={FadeInDown.duration(350)}>
          <LinearGradient
            colors={[ADMIN, '#ff9d2f']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 24,
              padding: 18,
              shadowColor: ADMIN,
              shadowOpacity: 0.5,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))}
                hitSlop={12}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(0,0,0,0.18)',
                  }}
                >
                  <ArrowLeft size={20} color="#1b1405" />
                </View>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#1b1405', fontSize: 22, fontWeight: '900' }}>Admin Console</Text>
                <Text style={{ color: 'rgba(27,20,5,0.7)', fontSize: 12, fontWeight: '600' }}>
                  Main Court control panel
                </Text>
              </View>
              <Pressable
                onPress={onRefreshAdmin}
                disabled={refreshing}
                hitSlop={8}
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(0,0,0,0.18)',
                  opacity: refreshing ? 0.55 : 1,
                }}
              >
                <RefreshCw size={22} color="#1b1405" />
              </Pressable>
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(0,0,0,0.18)',
                }}
              >
                <ShieldCheck size={24} color="#1b1405" />
              </View>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 16,
                paddingTop: 14,
                borderTopWidth: 1,
                borderTopColor: 'rgba(27,20,5,0.18)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#1b7a3a' }} />
                <Text style={{ color: '#1b1405', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }}>
                  ADMIN MODE ACTIVE
                </Text>
              </View>
              <Text style={{ color: 'rgba(27,20,5,0.8)', fontSize: 12, fontWeight: '600' }}>
                {user.name}
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ADMIN_GROUPS.map((group) => {
            const active = group.key === activeGroup.key;
            return (
              <Pressable key={group.key} onPress={() => selectGroup(group.key)} style={{ flexGrow: 1, flexBasis: '22%' }}>
                <View
                  style={{
                    alignItems: 'center',
                    paddingVertical: 10,
                    borderRadius: 14,
                    backgroundColor: active ? `${ADMIN}24` : COLORS.card,
                    borderWidth: 1,
                    borderColor: active ? ADMIN : COLORS.cardBorder,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{ color: active ? ADMIN : COLORS.textMuted, fontWeight: '900', fontSize: 12 }}
                  >
                    {group.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Current section label */}
        <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: '900' }}>{activeTab?.label}</Text>
        <ErrorBanner message={adminRefreshErr ?? refreshError} />

        {/* ===== OVERVIEW ===== */}
        {tab === 'overview' && (
        <Animated.View entering={FadeInDown.delay(60).duration(350)} style={{ gap: 10 }}>
          <SectionTitle text="Overview" />
          <GlassCard accent={ADMIN}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Stat value={String(bookings.length)} label="Total" />
              <Stat value={String(upcomingCount)} label="Upcoming" />
              <Stat value={String(activeCourtBlocks.length)} label="Blocks" />
              <Stat value={String(userCount)} label="Users" />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable
                onPress={() => router.push('/admin-users')}
                style={({ pressed }) => ({
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: `${ADMIN}66`,
                  backgroundColor: `${ADMIN}1f`,
                  overflow: 'hidden',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Users size={16} color={ADMIN} />
                <Text style={{ color: ADMIN, fontWeight: '800', fontSize: 13 }}>Manage Users</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/availability')}
                style={({ pressed }) => ({
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: COLORS.cardBorder,
                  backgroundColor: COLORS.chip,
                  overflow: 'hidden',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <CalendarRange size={16} color={COLORS.neon} />
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 13 }}>Schedule</Text>
              </Pressable>
            </View>
          </GlassCard>

          <GlassCard accent={COLORS.success}>
            <View style={{ gap: 12 }}>
              <SectionTitle text="Revenue Dashboard" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[
                  ['today', 'Today'],
                  ['week', 'Week'],
                  ['month', 'Month'],
                  ['all', 'All'],
                ].map(([key, label]) => (
                  <FilterChip
                    key={key}
                    label={label}
                    color={COLORS.success}
                    selected={revenueRange === key}
                    onPress={() => setRevenueRange(key as RevenueRange)}
                  />
                ))}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <RevenueStat label="Expected" value={revenue.expected} color={COLORS.success} />
                <RevenueStat label="Completed" value={revenue.completed} color={COLORS.neon} />
                <RevenueStat label="Bookings" value={revenue.count} color={ADMIN} money={false} />
                <RevenueStat label="Basketball" value={revenue.basketball} color={COLORS.basketball} />
                <RevenueStat label="Tennis" value={revenue.tennis} color={COLORS.tennis} />
                <RevenueStat label="Coach" value={revenue.coach} color={COLORS.coach} />
              </View>
            </View>
          </GlassCard>

          <GlassCard accent={COLORS.neon}>
            <View style={{ gap: 12 }}>
              <SectionTitle text="CSV Exports" />
              <SubLabel text="Share reports to Files, Numbers, Excel, Google Sheets, Mail, or WhatsApp." />
              <ErrorBanner message={exportErr} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <ExportButton label="Bookings" onPress={onExportBookings} />
                <ExportButton label="Users" onPress={onExportUsers} />
                <ExportButton label="Revenue" onPress={onExportRevenue} />
                <ExportButton label="No-shows" onPress={onExportNoShows} />
              </View>
            </View>
          </GlassCard>
        </Animated.View>
        )}

        {/* ===== OVERVIEW: support contact ===== */}
        {tab === 'overview' && (
        <Animated.View entering={FadeInDown.delay(90).duration(350)} style={{ gap: 10 }}>
          <SectionTitle text="Support Contact" />
          <SubLabel text="Front-desk number shown to users who want to cancel a booking." />
          <TextInput
            value={pSupport}
            onChangeText={setPSupport}
            placeholder="+961 00 000 000"
            keyboardType="phone-pad"
            placeholderTextColor={COLORS.textFaint}
            style={inputStyle}
          />
          <ErrorBanner message={supportErr} />
          {supportOk ? (
            <Text style={{ color: COLORS.success, fontSize: 13, fontWeight: '600' }}>{supportOk}</Text>
          ) : null}
          <PrimaryGradientButton
            label="Save Support Number"
            icon={<Phone size={18} color="#05060f" />}
            colors={[ADMIN, '#ffb020']}
            onPress={onSaveSupport}
          />
        </Animated.View>
        )}

        {/* ===== PRICING ===== */}
        {tab === 'pricing' && (
        <Animated.View entering={FadeInDown.delay(50).duration(350)} style={{ gap: 14 }}>
          <SectionTitle text="Pricing" />
          <SubLabel text="Hourly rates ($/hr). Peak applies to bookings starting 4 PM–midnight." />

          <PriceRow label="Basketball — full court" off={pBasket} setOff={setPBasket} peak={pBasketPeak} setPeak={setPBasketPeak} inputStyle={inputStyle} offPh="30" peakPh="40" />
          <PriceRow label="Basketball — half court" off={pHalf} setOff={setPHalf} peak={pHalfPeak} setPeak={setPHalfPeak} inputStyle={inputStyle} offPh="18" peakPh="24" />
          <PriceRow label="Tennis" off={pTennis} setOff={setPTennis} peak={pTennisPeak} setPeak={setPTennisPeak} inputStyle={inputStyle} offPh="20" peakPh="28" />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, gap: 8 }}>
              <SubLabel text="Ball machine (flat, tennis add-on)" />
              <TextInput
                value={pMachine}
                onChangeText={setPMachine}
                placeholder="15"
                keyboardType="number-pad"
                placeholderTextColor={COLORS.textFaint}
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 1 }} />
          </View>

          <View style={{ gap: 8 }}>
            <SectionTitle text="Loyalty" />
            <SubLabel text="Points per booking after the first" />
            <TextInput
              value={pLoyaltyBooking}
              onChangeText={setPLoyaltyBooking}
              placeholder="10"
              keyboardType="number-pad"
              placeholderTextColor={COLORS.textFaint}
              style={inputStyle}
            />
            <Text style={{ color: COLORS.textMuted, fontSize: 12, lineHeight: 17 }}>
              First booking gives {loyaltySettings.firstBookingBonus} pts. Completed sessions add {loyaltySettings.completionBonus} pts. No-shows subtract {loyaltySettings.noShowPenalty} pts.
            </Text>
          </View>

          <View style={{ gap: 10 }}>
            <SectionTitle text="Tier Rewards" />
            <SubLabel text="Write one reward per line. These appear on the Rewards screen." />
            {(['bronze', 'silver', 'gold', 'platinum'] as LoyaltyTierKey[]).map((tier) => (
              <View key={tier} style={{ gap: 6 }}>
                <SubLabel text={`${tier[0].toUpperCase()}${tier.slice(1)} rewards`} />
                <TextInput
                  value={pTierPerks[tier]}
                  onChangeText={(value) => setPTierPerks((prev) => ({ ...prev, [tier]: value }))}
                  placeholder="Reward line"
                  placeholderTextColor={COLORS.textFaint}
                  multiline
                  style={[inputStyle, { minHeight: 86, textAlignVertical: 'top' }]}
                />
              </View>
            ))}
          </View>

          <View style={{ gap: 10 }}>
            <SectionTitle text="Operating Hours" />
            <SubLabel text="Weekly open and close times. Use 24:00 for midnight." />
            {hoursDraft.map((h) => (
              <View
                key={h.dayOfWeek}
                style={{
                  gap: 8,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: COLORS.card,
                  borderWidth: 1,
                  borderColor: COLORS.cardBorder,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '900', fontSize: 14 }}>{WEEKDAY_LABELS[h.dayOfWeek]}</Text>
                  <Pressable
                    onPress={() => setHoursDraft((prev) => prev.map((x) => x.dayOfWeek === h.dayOfWeek ? { ...x, isClosed: !x.isClosed } : x))}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor: h.isClosed ? `${COLORS.danger}22` : `${COLORS.success}22`,
                      borderWidth: 1,
                      borderColor: h.isClosed ? `${COLORS.danger}66` : `${COLORS.success}66`,
                    }}
                  >
                    <Text style={{ color: h.isClosed ? COLORS.danger : COLORS.success, fontWeight: '800', fontSize: 12 }}>
                      {h.isClosed ? 'Closed' : 'Open'}
                    </Text>
                  </Pressable>
                </View>
                {!h.isClosed ? (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TextInput
                      value={h.openTime}
                      onChangeText={(value) => setHoursDraft((prev) => prev.map((x) => x.dayOfWeek === h.dayOfWeek ? { ...x, openTime: value } : x))}
                      placeholder="08:00"
                      placeholderTextColor={COLORS.textFaint}
                      style={[inputStyle, { flex: 1 }]}
                    />
                    <TextInput
                      value={h.closeTime}
                      onChangeText={(value) => setHoursDraft((prev) => prev.map((x) => x.dayOfWeek === h.dayOfWeek ? { ...x, closeTime: value } : x))}
                      placeholder="24:00"
                      placeholderTextColor={COLORS.textFaint}
                      style={[inputStyle, { flex: 1 }]}
                    />
                  </View>
                ) : null}
              </View>
            ))}
            <ErrorBanner message={hoursErr} />
            {hoursOk ? <Text style={{ color: COLORS.success, fontSize: 13, fontWeight: '600' }}>{hoursOk}</Text> : null}
            <PrimaryGradientButton
              label="Save Operating Hours"
              icon={<Clock size={18} color="#05060f" />}
              colors={[ADMIN, '#ffb020']}
              onPress={onSaveHours}
            />
          </View>

          <ErrorBanner message={priceErr} />
          {priceOk ? (
            <Text style={{ color: COLORS.success, fontSize: 13, fontWeight: '600' }}>{priceOk}</Text>
          ) : null}
          <PrimaryGradientButton
            label="Save Pricing & Loyalty"
            icon={<DollarSign size={18} color="#05060f" />}
            colors={[ADMIN, '#ffb020']}
            onPress={onSavePricing}
          />
        </Animated.View>
        )}

        {/* ===== OVERVIEW: court blocks ===== */}
        {tab === 'overview' && (
        <>
        {/* Block court time */}
        <Animated.View entering={FadeInDown.delay(60).duration(350)} style={{ gap: 12 }}>
          <SectionTitle text="Block Court Time" />
          <SubLabel text="Date" />
          <DateSelector value={date} onChange={setDate} accent={ADMIN} />
          <SubLabel text="Start" />
          {adminDayHours.isClosed ? (
            <ErrorBanner message="The court is closed on this day." />
          ) : (
            <TimeSlotPicker value={time} onChange={setTime} accent={ADMIN} unavailable={unavailable} slots={adminDaySlots} />
          )}
          <SubLabel text="Duration" />
          <DurationSelector value={duration} onChange={setDuration} accent={ADMIN} />
          <SubLabel text="Reason" />
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Maintenance, private event"
            placeholderTextColor={COLORS.textFaint}
            style={{
              backgroundColor: COLORS.chip,
              borderWidth: 1,
              borderColor: COLORS.cardBorder,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              color: COLORS.text,
              fontSize: 15,
            }}
          />
          {/* Coaching session — book a coach into the SAME selected date/time/
              duration. Purple to stay distinct from the yellow block action. */}
          <View style={{ height: 1, backgroundColor: COLORS.cardBorder, marginTop: 2 }} />
          <Pressable
            onPress={() => {
              setShowCoach((v) => !v);
              setCbErr(null);
              setCbOk(null);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 13,
              borderRadius: 14,
              overflow: 'hidden',
              borderWidth: 1.5,
              borderColor: COLORS.coach,
              backgroundColor: pressed ? `${COLORS.coach}33` : COLORS.coachSoft,
            })}
          >
            <GraduationCap size={18} color={COLORS.coach} />
            <Text style={{ color: COLORS.coach, fontWeight: '800', fontSize: 14 }}>Book Coaching Session</Text>
            {showCoach ? <ChevronUp size={16} color={COLORS.coach} /> : <ChevronDown size={16} color={COLORS.coach} />}
          </Pressable>

          {showCoach ? (
            <View
              style={{
                gap: 12,
                borderWidth: 1,
                borderColor: `${COLORS.coach}55`,
                backgroundColor: `${COLORS.coach}12`,
                borderRadius: 16,
                padding: 14,
              }}
            >
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                Uses the date, start and duration selected above. Main Court is reserved automatically.
              </Text>

              <SubLabel text="Coach" />
              {coaches.length === 0 ? (
                <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>Add a coach first (Coaches tab).</Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {coaches.map((c) => (
                    <SelectChip key={c.id} label={c.name} selected={cbCoachId === c.id} onPress={() => setCbCoachId(c.id)} />
                  ))}
                </View>
              )}

              <SubLabel text="Repeat weekly" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { weeks: 1, label: 'Once' },
                  { weeks: 2, label: '2 weeks' },
                  { weeks: 4, label: '4 weeks' },
                  { weeks: 6, label: '6 weeks' },
                ].map((opt) => (
                  <SelectChip
                    key={opt.weeks}
                    label={opt.label}
                    selected={cbRepeatWeeks === opt.weeks}
                    onPress={() => setCbRepeatWeeks(opt.weeks)}
                  />
                ))}
              </View>

              <ErrorBanner message={cbErr} />
              {cbOk ? (
                <Text style={{ color: COLORS.success, fontSize: 13, fontWeight: '600' }}>{cbOk}</Text>
              ) : null}
              <PrimaryGradientButton
                label="Confirm Coaching Booking"
                icon={<GraduationCap size={18} color="#05060f" />}
                colors={[COLORS.coach, '#9d90ff']}
                onPress={onBookCoach}
              />
            </View>
          ) : null}

          <ErrorBanner message={error} />
          {okMsg ? (
            <Text style={{ color: COLORS.success, fontSize: 13, fontWeight: '600' }}>{okMsg}</Text>
          ) : null}
          <PrimaryGradientButton
            label="Block This Slot"
            icon={<Ban size={18} color="#05060f" />}
            colors={[ADMIN, '#ffb020']}
            onPress={onBlock}
          />
        </Animated.View>

        {/* Existing blocks */}
        {activeCourtBlocks.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionTitle text="Active Blocks" />
            {activeCourtBlocks.map((blk) => (
                <GlassCard key={blk.id} accent={ADMIN}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 15 }}>{blk.reason}</Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2 }}>
                        {fmtDate(blk.startTime)} · {fmtTime(blk.startTime)} – {fmtTime(blk.endTime)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => removeCourtBlock(blk.id)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: `${COLORS.danger}66`,
                        backgroundColor: `${COLORS.danger}1a`,
                        overflow: 'hidden',
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Trash2 size={14} color={COLORS.danger} />
                      <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 13 }}>Remove</Text>
                    </Pressable>
                  </View>
                </GlassCard>
              ))}
          </View>
        ) : null}
        </>
        )}

        {/* ===== SCHEDULE ===== */}
        {tab === 'schedule' && (
        <View style={{ gap: 12 }}>
          <SectionTitle text="Weekly Schedule" />
          <GlassCard accent={ADMIN}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <SmallButton label="Prev" onPress={() => setScheduleWeek(addDays(scheduleWeek, -7))} />
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ color: COLORS.text, fontWeight: '900', fontSize: 15 }}>
                  {fmtDate(startOfWeek(scheduleWeek))}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                  to {fmtDate(addDays(startOfWeek(scheduleWeek), 6))}
                </Text>
              </View>
              <SmallButton label="Next" onPress={() => setScheduleWeek(addDays(scheduleWeek, 7))} />
            </View>
            <Pressable onPress={() => setScheduleWeek(startOfDay(new Date()))} style={{ alignSelf: 'center', marginTop: 10 }}>
              <Text style={{ color: ADMIN, fontWeight: '800', fontSize: 13 }}>Jump to this week</Text>
            </Pressable>
          </GlassCard>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              { key: 'basketball', label: 'Basketball', color: COLORS.basketball },
              { key: 'tennis', label: 'Tennis', color: COLORS.tennis },
              { key: 'coach', label: 'Coach', color: COLORS.coach },
              { key: 'blocks', label: 'Blocks', color: ADMIN },
            ].map((f) => (
              <FilterChip
                key={f.key}
                label={f.label}
                color={f.color}
                selected={scheduleFilters[f.key as keyof typeof scheduleFilters]}
                onPress={() => setScheduleFilters((prev) => ({ ...prev, [f.key]: !prev[f.key as keyof typeof prev] }))}
              />
            ))}
          </View>

          {buildWeekDays(scheduleWeek).map((day) => {
            const items = scheduleItemsForDay(day, bookings, courtBlocks, scheduleFilters);
            return (
              <GlassCard key={day.toISOString()} accent={isSameDay(day, new Date()) ? ADMIN : undefined}>
                <View style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: COLORS.text, fontWeight: '900', fontSize: 16 }}>{fmtDate(day)}</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{items.length} item{items.length === 1 ? '' : 's'}</Text>
                  </View>
                  {items.length === 0 ? (
                    <Text style={{ color: COLORS.textFaint, fontSize: 13 }}>Open schedule</Text>
                  ) : (
                    items.map((item) => (
                      <Pressable
                        key={item.id}
                        onPress={() => item.kind === 'booking' ? router.push(`/admin-booking?id=${item.id}`) : undefined}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.75 : 1,
                          borderLeftWidth: 4,
                          borderLeftColor: item.color,
                          padding: 12,
                          borderRadius: 12,
                          backgroundColor: `${item.color}14`,
                        })}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Clock size={14} color={item.color} />
                          <Text style={{ color: item.color, fontWeight: '900', fontSize: 13 }}>{item.time}</Text>
                        </View>
                        <Text style={{ color: COLORS.text, fontWeight: '800', marginTop: 4 }}>{item.title}</Text>
                        <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>{item.subtitle}</Text>
                      </Pressable>
                    ))
                  )}
                </View>
              </GlassCard>
            );
          })}
        </View>
        )}

        {/* ===== COACHES ===== */}
        {tab === 'coaches' && (
        <>
        {/* Manage coaches */}
        <Animated.View entering={FadeInDown.delay(90).duration(350)} style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionTitle text={editingId ? 'Edit Coach' : 'Add a Coach'} />
            {editingId ? (
              <Pressable onPress={resetCoachForm} hitSlop={8}>
                <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '700' }}>Cancel edit</Text>
              </Pressable>
            ) : null}
          </View>
          <SubLabel text="Name" />
          <TextInput
            value={cName}
            onChangeText={setCName}
            placeholder="e.g. Coach Sara"
            placeholderTextColor={COLORS.textFaint}
            style={inputStyle}
          />
          <SubLabel text="Sports" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(['basketball', 'tennis'] as SportType[]).map((s) => {
              const on = cSports.includes(s);
              return (
                <Pressable key={s} onPress={() => toggleSport(s)} style={{ flex: 1 }}>
                  <View
                    style={{
                      paddingVertical: 12,
                      borderRadius: 14,
                      alignItems: 'center',
                      backgroundColor: on ? `${ADMIN}26` : COLORS.card,
                      borderWidth: 1.5,
                      borderColor: on ? ADMIN : COLORS.cardBorder,
                    }}
                  >
                    <Text style={{ color: on ? ADMIN : COLORS.text, fontWeight: '800' }}>{sportLabel(s)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <SubLabel text="Short bio" />
          <TextInput
            value={cBio}
            onChangeText={setCBio}
            placeholder="e.g. Footwork & conditioning specialist"
            placeholderTextColor={COLORS.textFaint}
            style={inputStyle}
          />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, gap: 8 }}>
              <SubLabel text="Rate ($/hr)" />
              <TextInput
                value={cPrice}
                onChangeText={setCPrice}
                placeholder="30"
                keyboardType="number-pad"
                placeholderTextColor={COLORS.textFaint}
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 1.4, gap: 8 }}>
              <SubLabel text="Phone" />
              <TextInput
                value={cPhone}
                onChangeText={setCPhone}
                placeholder="+1 (555) 000-0000"
                keyboardType="phone-pad"
                placeholderTextColor={COLORS.textFaint}
                style={inputStyle}
              />
            </View>
          </View>
          <ErrorBanner message={coachError} />
          {coachOk ? (
            <Text style={{ color: COLORS.success, fontSize: 13, fontWeight: '600' }}>{coachOk}</Text>
          ) : null}
          <PrimaryGradientButton
            label={editingId ? 'Save Changes' : 'Add Coach'}
            icon={<UserPlus size={18} color="#05060f" />}
            colors={[ADMIN, '#ffb020']}
            onPress={onSaveCoach}
          />
        </Animated.View>

        {/* Existing coaches */}
        <View style={{ gap: 12 }}>
          <SectionTitle text={`Coaches (${coaches.length})`} />
          {coaches.length === 0 ? (
            <EmptyState title="No coaches" subtitle="Add a coach above to list them for users." />
          ) : (
            coaches.map((c) => (
              <CoachCard key={c.id} coach={c} onEdit={startEditCoach} onRemove={removeCoach} />
            ))
          )}
        </View>
        </>
        )}

        {/* ===== RULES ===== */}
        {tab === 'rules' && (
        <>
        <Animated.View entering={FadeInDown.delay(50).duration(350)} style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionTitle text={editingRuleId ? 'Edit Rule' : 'Add a Rule'} />
            {editingRuleId ? (
              <Pressable onPress={resetRuleForm} hitSlop={8}>
                <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '700' }}>Cancel edit</Text>
              </Pressable>
            ) : null}
          </View>
          <SubLabel text="Title" />
          <TextInput
            value={rTitle}
            onChangeText={setRTitle}
            placeholder="e.g. Arrive early"
            placeholderTextColor={COLORS.textFaint}
            style={inputStyle}
          />
          <SubLabel text="Rule text" />
          <TextInput
            value={rContent}
            onChangeText={setRContent}
            placeholder="Describe the rule…"
            placeholderTextColor={COLORS.textFaint}
            multiline
            style={[inputStyle, { minHeight: 92, textAlignVertical: 'top' }]}
          />
          <ErrorBanner message={ruleErr} />
          {ruleOk ? (
            <Text style={{ color: COLORS.success, fontSize: 13, fontWeight: '600' }}>{ruleOk}</Text>
          ) : null}
          <PrimaryGradientButton
            label={editingRuleId ? 'Save Changes' : 'Add Rule'}
            icon={<Plus size={18} color="#05060f" />}
            colors={[ADMIN, '#ffb020']}
            onPress={onSaveRule}
          />
        </Animated.View>

        <View style={{ gap: 12 }}>
          <SectionTitle text={`Rules (${sortedRules.length})`} />
          {sortedRules.length === 0 ? (
            <EmptyState title="No rules" subtitle="Add a rule above to show it on the Rules screen." />
          ) : (
            sortedRules.map((rule, i) => (
              <GlassCard key={rule.id}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: `${ADMIN}1f`,
                    }}
                  >
                    <Text style={{ color: ADMIN, fontWeight: '800', fontSize: 13 }}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 15 }}>{rule.title}</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 13, lineHeight: 19 }}>{rule.content}</Text>
                  </View>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 8,
                    marginTop: 12,
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: COLORS.cardBorder,
                  }}
                >
                  <RuleIconBtn disabled={i === 0} onPress={() => reorderRule(rule.id, 'up')}>
                    <ArrowUp size={16} color={i === 0 ? COLORS.textFaint : COLORS.text} />
                  </RuleIconBtn>
                  <RuleIconBtn disabled={i === sortedRules.length - 1} onPress={() => reorderRule(rule.id, 'down')}>
                    <ArrowDown size={16} color={i === sortedRules.length - 1 ? COLORS.textFaint : COLORS.text} />
                  </RuleIconBtn>
                  <RuleIconBtn onPress={() => startEditRule(rule.id)}>
                    <Pencil size={15} color={COLORS.neon} />
                  </RuleIconBtn>
                  <RuleIconBtn danger onPress={() => removeRule(rule.id)}>
                    <Trash2 size={15} color={COLORS.danger} />
                  </RuleIconBtn>
                </View>
              </GlassCard>
            ))
          )}
        </View>
        </>
        )}

        {/* ===== BOOKINGS ===== */}
        {tab === 'bookings' && (
        <View style={{ gap: 12 }}>
          <SectionTitle text="Bookings by Day" />
          <DateSelector value={bookingsDay} onChange={setBookingsDay} accent={ADMIN} startOffsetDays={-2} days={21} />
          <TextInput
            value={bookingSearch}
            onChangeText={setBookingSearch}
            placeholder="Search name, email, phone..."
            placeholderTextColor={COLORS.textFaint}
            style={inputStyle}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              ['all', 'All'],
              ['upcoming', 'Upcoming'],
              ['completed', 'Completed'],
              ['cancelled', 'Cancelled'],
              ['no_show', 'No-show'],
            ].map(([key, label]) => (
              <FilterChip key={key} label={label} color={ADMIN} selected={bookingStatusFilter === key} onPress={() => setBookingStatusFilter(key as typeof bookingStatusFilter)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              ['all', 'All types'],
              ['court', 'Court'],
              ['coach', 'Coach'],
            ].map(([key, label]) => (
              <FilterChip key={key} label={label} color={COLORS.neon} selected={bookingTypeFilter === key} onPress={() => setBookingTypeFilter(key as typeof bookingTypeFilter)} />
            ))}
            {[
              ['all', 'All sports'],
              ['basketball', 'Basketball'],
              ['tennis', 'Tennis'],
            ].map(([key, label]) => (
              <FilterChip
                key={key}
                label={label}
                color={key === 'basketball' ? COLORS.basketball : key === 'tennis' ? COLORS.tennis : ADMIN}
                selected={bookingSportFilter === key}
                onPress={() => setBookingSportFilter(key as typeof bookingSportFilter)}
              />
            ))}
          </View>
          <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '600' }}>
            {fmtDate(bookingsDay)} · {dayBookings.length} booking{dayBookings.length === 1 ? '' : 's'}
          </Text>
          {filteredDayBookings.length === 0 ? (
            <EmptyState title="No bookings this day" subtitle="Pick another day above." />
          ) : (
            filteredDayBookings.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                bookedByName={nameOf(b.userId)}
                onPress={() => router.push(`/admin-booking?id=${b.id}`)}
              />
            ))
          )}
        </View>
        )}

        {/* ===== USERS ===== */}
        {tab === 'users' && (
        <View style={{ gap: 12 }}>
          <SectionTitle text={`Users (${userCount})`} />
          <TextInput
            value={userSearch}
            onChangeText={setUserSearch}
            placeholder="Search name, email, phone, tier..."
            placeholderTextColor={COLORS.textFaint}
            style={inputStyle}
          />
          <SubLabel text="Tap a user for their full history, loyalty and standing." />
          <UserRosterList search={userSearch} />
        </View>
        )}

        {/* ===== AUDIT ===== */}
        {tab === 'audit' && (
        <View style={{ gap: 12 }}>
          <SectionTitle text={`Audit Log (${auditLogs.length})`} />
          {auditLogs.length === 0 ? (
            <EmptyState title="No audit entries" subtitle="Admin actions will appear here after the database upgrade is run." />
          ) : (
            auditLogs.map((log) => {
              const actor = users.find((u) => u.id === log.adminUserId);
              return (
                <GlassCard key={log.id} accent={ADMIN}>
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ShieldCheck size={16} color={ADMIN} />
                      <Text style={{ color: ADMIN, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', flex: 1 }}>
                        {log.action.replace(/\./g, ' ')}
                      </Text>
                      <Text style={{ color: COLORS.textFaint, fontSize: 11 }}>{fmtTime(log.createdAt)}</Text>
                    </View>
                    <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 14 }}>{log.summary}</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                      {actor?.name ?? 'Admin'} · {fmtDate(log.createdAt)} · {log.entityType}
                    </Text>
                  </View>
                </GlassCard>
              );
            })
          )}
        </View>
        )}

        {/* ===== HEALTH ===== */}
        {tab === 'health' && (
        <View style={{ gap: 12 }}>
          <SectionTitle text="System Health" />
          <GlassCard accent={refreshError ? COLORS.danger : COLORS.success}>
            <View style={{ gap: 12 }}>
              <HealthRow label="Supabase data" value={refreshError ? 'Partial' : 'Loaded'} good={!refreshError} />
              <HealthRow label="Admin user" value={user.name} good />
              <HealthRow label="Bookings" value={String(bookings.length)} good />
              <HealthRow label="Users" value={String(users.length)} good />
              <HealthRow label="Court blocks" value={String(courtBlocks.length)} good />
              <HealthRow label="Audit logs" value={String(auditLogs.length)} good />
              <HealthRow label="Notifications" value={String(notifications.length)} good />
              <HealthRow label="Operating hours" value={operatingHours.length === 7 ? '7 days loaded' : `${operatingHours.length} days`} good={operatingHours.length === 7} />
              <HealthRow label="Push support" value={pushStatus.token ? 'Token registered' : pushStatus.reason} good={pushStatus.supported && !!pushStatus.token} />
              <HealthRow
                label="SQL migrations"
                value={`${schemaMigrations.length}/${REQUIRED_MIGRATIONS.length} tracked`}
                good={REQUIRED_MIGRATIONS.every((m) => schemaMigrations.some((row) => row.key === m.key))}
              />
              <HealthRow label="Last refresh" value={lastRefreshedAt ? `${fmtDate(lastRefreshedAt)} ${fmtTime(lastRefreshedAt)}` : 'Not yet'} good={!!lastRefreshedAt} />
              <ErrorBanner message={adminRefreshErr ?? refreshError} />
              <Pressable
                onPress={onRefreshAdmin}
                disabled={refreshing}
                style={({ pressed }) => ({
                  opacity: pressed || refreshing ? 0.7 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 13,
                  borderRadius: 14,
                  backgroundColor: `${COLORS.success}1f`,
                  borderWidth: 1,
                  borderColor: `${COLORS.success}66`,
                })}
              >
                <RefreshCw size={16} color={COLORS.success} />
                <Text style={{ color: COLORS.success, fontWeight: '900', fontSize: 14 }}>
                  {refreshing ? 'Refreshing...' : 'Refresh Now'}
                </Text>
              </Pressable>
            </View>
          </GlassCard>
          <GlassCard>
            <View style={{ gap: 10 }}>
              {REQUIRED_MIGRATIONS.map((m) => {
                const row = schemaMigrations.find((r) => r.key === m.key);
                return (
                  <HealthRow
                    key={m.key}
                    label={m.label}
                    value={row ? fmtDate(row.appliedAt) : 'Missing'}
                    good={!!row}
                  />
                );
              })}
            </View>
          </GlassCard>
        </View>
        )}
      </ScrollView>

      <AdminTabBar tabs={visibleTabs} active={tab} onChange={setTab} />
    </ScreenContainer>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const ADMIN = COLORS.warning;
  return (
    <View style={{ alignItems: 'center', flex: 1, paddingHorizontal: 2 }}>
      <Text numberOfLines={1} style={{ color: ADMIN, fontSize: 22, fontWeight: '900' }}>{value}</Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color: COLORS.textMuted, fontSize: 11, textAlign: 'center' }}
      >
        {label}
      </Text>
    </View>
  );
}

function RevenueStat({ label, value, color, money = true }: { label: string; value: number; color: string; money?: boolean }) {
  return (
    <View
      style={{
        width: '31%',
        minWidth: 94,
        flexGrow: 1,
        padding: 12,
        borderRadius: 14,
        backgroundColor: `${color}14`,
        borderWidth: 1,
        borderColor: `${color}44`,
      }}
    >
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color, fontWeight: '900', fontSize: 17 }}>
        {money ? `$${Math.round(value)}` : String(Math.round(value))}
      </Text>
      <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function ExportButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexGrow: 1,
        minWidth: '45%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: COLORS.chip,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Download size={15} color={COLORS.neon} />
      <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function HealthRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: good ? COLORS.success : COLORS.danger }} />
      <Text style={{ color: COLORS.textMuted, fontSize: 13, flex: 1 }}>{label}</Text>
      <Text style={{ color: COLORS.text, fontSize: 13, fontWeight: '800', textAlign: 'right', flex: 1 }}>{value}</Text>
    </View>
  );
}
function SectionTitle({ text }: { text: string }) {
  const ADMIN = COLORS.warning;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: ADMIN }} />
      <Text style={{ color: COLORS.text, fontSize: 13, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>
        {text}
      </Text>
    </View>
  );
}
function SubLabel({ text }: { text: string }) {
  return <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '700' }}>{text}</Text>;
}

function linesFromText(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

function timeStringToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.NaN;
  return h * 60 + m;
}

function isInRevenueRange(date: Date, range: RevenueRange): boolean {
  const now = new Date();
  if (range === 'all') return true;
  if (range === 'today') return isSameDay(date, now);
  if (range === 'week') {
    const start = startOfWeekLocal(now);
    const end = addDays(start, 7);
    return date >= start && date < end;
  }
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return date >= monthStart && date < nextMonth;
}

function startOfWeekLocal(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return startOfDay(d);
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function buildWeekDays(date: Date): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function scheduleItemsForDay(
  day: Date,
  bookings: Booking[],
  blocks: CourtBlock[],
  filters: { basketball: boolean; tennis: boolean; coach: boolean; blocks: boolean },
) {
  const bookingItems = bookings
    .filter((b) => isSameDay(parseISO(b.startTime), day))
    .filter((b) => {
      if (b.bookingType === 'coach') return filters.coach;
      return b.sportType === 'basketball' ? filters.basketball : filters.tennis;
    })
    .map((b) => {
      const isCoach = b.bookingType === 'coach';
      const color = isCoach ? COLORS.coach : b.sportType === 'basketball' ? COLORS.basketball : COLORS.tennis;
      return {
        id: b.id,
        kind: 'booking' as const,
        color,
        time: `${fmtTime(b.startTime)} - ${fmtTime(b.endTime)}`,
        title: isCoach ? 'Coach + court' : sportLabel(b.sportType),
        subtitle: `${b.status}${b.noShow ? ' · no-show' : ''}`,
        start: parseISO(b.startTime).getTime(),
      };
    });

  const blockItems = filters.blocks
    ? blocks
        .filter((b) => isSameDay(parseISO(b.startTime), day))
        .map((b) => ({
          id: b.id,
          kind: 'block' as const,
          color: COLORS.warning,
          time: `${fmtTime(b.startTime)} - ${fmtTime(b.endTime)}`,
          title: b.reason,
          subtitle: 'Court block',
          start: parseISO(b.startTime).getTime(),
        }))
    : [];

  return [...bookingItems, ...blockItems].sort((a, b) => a.start - b.start);
}

function FilterChip({
  label,
  color,
  selected,
  onPress,
}: {
  label: string;
  color: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? color : COLORS.cardBorder,
        backgroundColor: selected ? `${color}22` : COLORS.chip,
      }}
    >
      <Text style={{ color: selected ? color : COLORS.textMuted, fontWeight: '800', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function SmallButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 12,
        backgroundColor: pressed ? `${COLORS.warning}33` : COLORS.chip,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

/** Selectable pill used in compact admin choices. */
function SelectChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: selected ? COLORS.coach : COLORS.cardBorder,
        backgroundColor: selected ? `${COLORS.coach}26` : COLORS.chip,
      }}
    >
      <Text style={{ color: selected ? COLORS.coach : COLORS.text, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

/** Small square icon button used for rule reorder / edit / delete actions. */
function RuleIconBtn({
  children,
  onPress,
  disabled,
  danger,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: danger ? `${COLORS.danger}55` : COLORS.cardBorder,
        backgroundColor: danger ? `${COLORS.danger}14` : COLORS.chip,
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

/** One pricing row: a labelled off-peak / peak pair of rate inputs. */
function PriceRow({
  label,
  off,
  setOff,
  peak,
  setPeak,
  inputStyle,
  offPh,
  peakPh,
}: {
  label: string;
  off: string;
  setOff: (v: string) => void;
  peak: string;
  setPeak: (v: string) => void;
  inputStyle: StyleProp<TextStyle>;
  offPh: string;
  peakPh: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <SubLabel text={label} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: COLORS.textFaint, fontSize: 11, fontWeight: '700' }}>Off-peak (8 AM–4 PM)</Text>
          <TextInput
            value={off}
            onChangeText={setOff}
            placeholder={offPh}
            keyboardType="number-pad"
            placeholderTextColor={COLORS.textFaint}
            style={inputStyle}
          />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: COLORS.warning, fontSize: 11, fontWeight: '700' }}>Peak (4 PM–12 AM)</Text>
          <TextInput
            value={peak}
            onChangeText={setPeak}
            placeholder={peakPh}
            keyboardType="number-pad"
            placeholderTextColor={COLORS.textFaint}
            style={inputStyle}
          />
        </View>
      </View>
    </View>
  );
}
