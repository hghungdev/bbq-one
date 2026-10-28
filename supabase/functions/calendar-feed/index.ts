// G1: Supabase Edge Function — link Google Calendar (iCal, một chiều). Xem specs/G1-google-calendar-feed.spec.md.
//
// Triển khai (một lần):
//   supabase functions deploy calendar-feed --no-verify-jwt --project-ref <ref>
// --no-verify-jwt: Google Calendar tải link KHÔNG đăng nhập — token trong đường dẫn là cửa duy nhất.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY: Supabase tự cấp cho mọi Edge Function (không đặt ở client).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleFeedRequest } from './handler.ts'
import type { FeedEvent } from './ics.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
})

Deno.serve((req) =>
  handleFeedRequest(req, {
    async findFeed(token) {
      const { data, error } = await admin
        .from('calendar_feeds')
        .select('user_id, enabled')
        .eq('token', token)
        .maybeSingle()
      if (error) throw error
      return data
    },
    async listEvents(userId, fromDate, toDate) {
      const { data, error } = await admin
        .from('calendar_events')
        .select('id, title, description, event_date, start_time, end_time, is_done, updated_at')
        .eq('user_id', userId)
        .gte('event_date', fromDate)
        .lte('event_date', toDate)
        .order('event_date', { ascending: true })
        .order('position', { ascending: true })
      if (error) throw error
      return (data ?? []) as FeedEvent[]
    },
    async touch(userId) {
      await admin.from('calendar_feeds').update({ last_fetched_at: new Date().toISOString() }).eq('user_id', userId)
    },
    now: () => new Date(),
  }),
)
