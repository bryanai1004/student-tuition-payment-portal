import { io, type Socket } from 'socket.io-client'
import { API_BASE } from './api'

type EnrollmentChangedAction = 'registered' | 'dropped'

export type EnrollmentChangedEvent = {
  type: 'enrollment.changed'
  studentId: string
  sectionId: number | null
  action: EnrollmentChangedAction
  occurredAt: string
}

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

function readAdminSession(): { adminRole?: string; adminEmail?: string } {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.sessionStorage.getItem('amu_admin_session')
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { role?: unknown; email?: unknown }
    const adminRole =
      typeof parsed.role === 'string' && parsed.role.trim() !== ''
        ? parsed.role.trim()
        : undefined
    const adminEmail =
      typeof parsed.email === 'string' && parsed.email.trim() !== ''
        ? parsed.email.trim()
        : undefined
    return { adminRole, adminEmail }
  } catch {
    return {}
  }
}

export const socket: Socket = io(API_BASE, {
  autoConnect: false,
  withCredentials: true,
  transports: ['websocket', 'polling'],
  auth: (cb) => {
    const token = readStudentAccessTokenFromStorage()
    const { adminRole, adminEmail } = readAdminSession()
    cb({
      ...(token ? { token } : {}),
      ...(adminRole ? { adminRole } : {}),
      ...(adminEmail ? { adminEmail } : {}),
    })
  },
})
