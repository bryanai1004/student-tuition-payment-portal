import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { io, type Socket } from 'socket.io-client'
import { API_BASE } from './api'

export type EnrollmentChangedAction = 'registered' | 'dropped'

export type EnrollmentChangedEvent = {
  type: 'enrollment.changed'
  studentId: string
  sectionId: number | null
  action: EnrollmentChangedAction
  occurredAt: string
}

const ENROLLMENT_CHANGED_EVENT = 'enrollment.changed'

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

const STUDENT_AUTH_STORAGE_KEYS = [
  'portal_student_auth_token',
  'studentToken',
  'token',
] as const

function readStudentAccessTokenFromStorage(): string | null {
  try {
    for (const key of STUDENT_AUTH_STORAGE_KEYS) {
      const raw = localStorage.getItem(key)
      const trimmed = raw?.trim() ?? ''
      if (trimmed !== '') return trimmed
    }
  } catch {
    // Ignore localStorage access errors.
  }
  return null
}

function isSupabaseRealtimeConfigured(): boolean {
  return SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== ''
}

let supabaseClient: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) return supabaseClient
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return supabaseClient
}

function normalizeEnrollmentChangedEvent(payload: unknown): EnrollmentChangedEvent | null {
  if (payload == null || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const nested =
    record.payload != null && typeof record.payload === 'object'
      ? (record.payload as Record<string, unknown>)
      : record

  if (nested.type !== 'enrollment.changed') return null
  if (typeof nested.studentId !== 'string') return null
  if (nested.action !== 'registered' && nested.action !== 'dropped') return null
  if (typeof nested.occurredAt !== 'string') return null

  const sectionIdRaw = nested.sectionId
  const sectionId =
    sectionIdRaw == null
      ? null
      : typeof sectionIdRaw === 'number' && Number.isFinite(sectionIdRaw)
        ? sectionIdRaw
        : null

  return {
    type: 'enrollment.changed',
    studentId: nested.studentId,
    sectionId,
    action: nested.action,
    occurredAt: nested.occurredAt,
  }
}

let socketClient: Socket | null = null

function getSocketClient(): Socket {
  if (socketClient) return socketClient
  socketClient = io(API_BASE, {
    autoConnect: false,
    withCredentials: true,
    transports: ['websocket', 'polling'],
    auth: (cb) => {
      const token = readStudentAccessTokenFromStorage()
      cb({
        ...(token ? { token } : {}),
      })
    },
  })
  return socketClient
}

/** @deprecated Prefer `subscribeEnrollmentChanged` — kept for legacy imports. */
export const socket = new Proxy({} as Socket, {
  get(_target, prop, receiver) {
    const client = getSocketClient()
    const value = Reflect.get(client, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})

export type EnrollmentChangedUnsubscribe = () => void

export function subscribeEnrollmentChanged(
  onEvent: (event: EnrollmentChangedEvent) => void,
): EnrollmentChangedUnsubscribe {
  if (isSupabaseRealtimeConfigured()) {
    return subscribeEnrollmentChangedViaSupabase(onEvent)
  }

  if (
    import.meta.env.PROD &&
    API_BASE !== '' &&
    /wanpanel\.ai$/i.test(new URL(API_BASE).hostname)
  ) {
    console.warn(
      '[realtime] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are unset — admin enrollment live updates are disabled in production.',
    )
  }

  return subscribeEnrollmentChangedViaSocket(onEvent)
}

function subscribeEnrollmentChangedViaSupabase(
  onEvent: (event: EnrollmentChangedEvent) => void,
): EnrollmentChangedUnsubscribe {
  const supabase = getSupabaseClient()
  const channel: RealtimeChannel = supabase.channel('admin-global')

  channel.on('broadcast', { event: ENROLLMENT_CHANGED_EVENT }, (message) => {
    const event = normalizeEnrollmentChangedEvent(message)
    if (event != null) onEvent(event)
  })

  void channel.subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

function subscribeEnrollmentChangedViaSocket(
  onEvent: (event: EnrollmentChangedEvent) => void,
): EnrollmentChangedUnsubscribe {
  const client = getSocketClient()
  const handleEnrollmentChanged = (payload: unknown) => {
    const event = normalizeEnrollmentChangedEvent(payload)
    if (event != null) onEvent(event)
  }

  client.connect()
  client.on(ENROLLMENT_CHANGED_EVENT, handleEnrollmentChanged)

  return () => {
    client.off(ENROLLMENT_CHANGED_EVENT, handleEnrollmentChanged)
  }
}

export function isEnrollmentRealtimeAvailable(): boolean {
  return isSupabaseRealtimeConfigured() || API_BASE !== ''
}
