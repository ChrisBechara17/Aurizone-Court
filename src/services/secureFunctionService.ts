import { supabase } from './supabaseClient';

export type SecureFunctionName =
  | 'booking-create'
  | 'admin-bookings'
  | 'admin-management'
  | 'admin-notifications'
  | 'device-token';

export type SecureResponse<T> =
  | { ok: true; data?: T }
  | { ok: false; error: string; code: string; retryAfter?: number };

export const secureWritesEnabled = process.env.EXPO_PUBLIC_SECURE_WRITES === 'true';

function requestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function invokeSecure<T>(name: SecureFunctionName, body: unknown): Promise<T> {
  const raw = body as Record<string, any>;
  const payload = name === 'device-token' || raw.requestId ? raw : { ...raw, requestId: requestId() };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabase.functions.invoke<SecureResponse<T>>(name, { body: payload });
    if (error) {
      let message = error.message;
      let code = 'EDGE_FUNCTION_ERROR';
      let retryAfter: number | undefined;
      const response = (error as any).context as Response | undefined;
      try {
        const responsePayload = response ? await response.clone().json() : null;
        if (responsePayload?.error) message = responsePayload.error;
        if (responsePayload?.code) code = responsePayload.code;
        if (typeof responsePayload?.retryAfter === 'number') retryAfter = responsePayload.retryAfter;
      } catch {
        // Keep the SDK message when the response has no JSON body.
      }
      if (attempt === 0 && (!response || response.status >= 500)) continue;
      const detailed = new Error(message) as Error & { code?: string; retryAfter?: number };
      detailed.code = code;
      detailed.retryAfter = retryAfter;
      throw detailed;
    }
    if (!data?.ok) {
      const err = new Error(data?.error ?? 'Secure operation failed.') as Error & {
        code?: string;
        retryAfter?: number;
      };
      err.code = data?.code;
      err.retryAfter = data?.retryAfter;
      throw err;
    }
    return data.data as T;
  }
  throw new Error('Secure operation failed.');
}
