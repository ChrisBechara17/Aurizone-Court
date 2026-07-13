import { useEffect } from 'react';
import { AppState } from 'react-native';
import { UserNotification } from '@/models';
import { supabase } from '@/services/supabaseClient';
import { useAppStore } from '@/store/useAppStore';

function toNotification(row: Record<string, any>): UserNotification {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    type: row.type,
    relatedEntityType: row.related_entity_type ?? null,
    relatedEntityId: row.related_entity_id ?? null,
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
  };
}

/** Keep the active account's private notification and booking state current. */
export function useRealtimeSync() {
  const userId = useAppStore((state) => state.user?.id ?? null);
  const isAdmin = useAppStore((state) => !!state.user?.isAdmin);

  useEffect(() => {
    if (!userId) return;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (useAppStore.getState().user?.id === userId) {
          void useAppStore.getState().refresh();
        }
      }, 400);
    };

    const bookingFilter = isAdmin ? undefined : `user_id=eq.${userId}`;
    const channel = supabase
      .channel(`app-live:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          useAppStore.getState().receiveRealtimeNotification(toNotification(payload.new));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          useAppStore.getState().receiveRealtimeNotification(toNotification(payload.new));
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          ...(bookingFilter ? { filter: bookingFilter } : {}),
        },
        scheduleRefresh,
      )
      .subscribe((status) => {
        // Recover anything committed while the socket was connecting or asleep.
        if (status === 'SUBSCRIBED') scheduleRefresh();
      });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') scheduleRefresh();
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      appStateSubscription.remove();
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, userId]);
}
