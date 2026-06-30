import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  clearCourseBinOnServer,
  loadCourseBinFromServer,
  removeCourseBinItemFromServer,
  saveCourseBinItemToServer,
  syncLocalCourseBinToServer,
} from './courseBinSync'

const STORAGE_KEY_PREFIX = 'portal.registration.courseBin:v1:'

export type CourseBinItem = {
  /** Server row id when synced; absent for offline-only drafts. */
  id?: number
  course_code: string
  eng_name: string
  chi_name: string
  prerequisite_course_id?: string | null
  prerequisite_course_code?: string | null
  prerequisite_course_title?: string | null
  units: string
  section: string
  schedule_track?: 'EN' | 'CN'
  session: string
  type: string
  registered: string
  time: string
  days: string
  instructor: string
  location: string
  schedule_weekday?: string | null
  schedule_start_time?: string | null
  schedule_end_time?: string | null
}

type CourseBinContextValue = {
  items: CourseBinItem[]
  /** True while the initial server hydrate for the current student/term is in flight. */
  hydrating: boolean
  addToCourseBin: (item: CourseBinItem) => void
  removeFromCourseBin: (
    courseCode: string,
    section: string,
    scheduleTrack?: 'EN' | 'CN',
  ) => void
  clearCourseBin: () => Promise<void>
}

const CourseBinContext = createContext<CourseBinContextValue | null>(null)

function normalizeBinTrack(track: 'EN' | 'CN' | undefined): 'EN' | 'CN' {
  return track === 'CN' ? 'CN' : 'EN'
}

export function courseBinSectionKey(
  courseCode: string,
  section: string,
  scheduleTrack?: 'EN' | 'CN',
): string {
  const tr = normalizeBinTrack(scheduleTrack)
  return `${courseCode.trim().toLowerCase()}|${section.trim().toLowerCase()}|${tr}`
}

export function courseBinKeyFromSectionFields(args: {
  course_code: string
  section_code: string
  schedule_track?: 'EN' | 'CN' | string | null
}): string {
  const raw = args.schedule_track
  const tr: 'EN' | 'CN' | undefined =
    raw === 'CN' || (typeof raw === 'string' && raw.trim().toUpperCase() === 'CN')
      ? 'CN'
      : undefined
  return courseBinSectionKey(args.course_code, args.section_code, tr)
}

export function isCourseBinKeyInItemList(
  key: string,
  items: CourseBinItem[],
): boolean {
  return items.some(
    (it) => courseBinSectionKey(it.course_code, it.section, it.schedule_track) === key,
  )
}

function storageKeyForTerm(registrationTermId: string): string | null {
  const tid = registrationTermId.trim()
  return tid === '' ? null : `${STORAGE_KEY_PREFIX}${tid}`
}

function isCourseBinItemRecord(v: unknown): v is CourseBinItem {
  if (v == null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  const isOptionalNullableString = (value: unknown): boolean =>
    value === undefined || value === null || typeof value === 'string'
  if (
    o.id !== undefined &&
    (typeof o.id !== 'number' || !Number.isFinite(o.id))
  ) {
    return false
  }
  if (
    o.schedule_track !== undefined &&
    o.schedule_track !== 'EN' &&
    o.schedule_track !== 'CN'
  ) {
    return false
  }
  return (
    typeof o.course_code === 'string' &&
    typeof o.eng_name === 'string' &&
    typeof o.chi_name === 'string' &&
    typeof o.units === 'string' &&
    typeof o.section === 'string' &&
    typeof o.session === 'string' &&
    typeof o.type === 'string' &&
    typeof o.registered === 'string' &&
    typeof o.time === 'string' &&
    typeof o.days === 'string' &&
    typeof o.instructor === 'string' &&
    typeof o.location === 'string' &&
    isOptionalNullableString(o.prerequisite_course_id) &&
    isOptionalNullableString(o.prerequisite_course_code) &&
    isOptionalNullableString(o.prerequisite_course_title)
  )
}

function normalizeCourseBinItem(item: CourseBinItem): CourseBinItem {
  return {
    ...item,
    prerequisite_course_id: item.prerequisite_course_id ?? null,
    prerequisite_course_code: item.prerequisite_course_code ?? null,
    prerequisite_course_title: item.prerequisite_course_title ?? null,
    schedule_track: normalizeBinTrack(item.schedule_track),
    schedule_weekday: item.schedule_weekday ?? null,
    schedule_start_time: item.schedule_start_time ?? null,
    schedule_end_time: item.schedule_end_time ?? null,
  }
}

function loadItemsFromStorage(registrationTermId: string): CourseBinItem[] {
  const key = storageKeyForTerm(registrationTermId)
  if (key == null) return []
  try {
    const raw = localStorage.getItem(key)
    if (raw == null || raw.trim() === '') return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isCourseBinItemRecord).map(normalizeCourseBinItem)
  } catch {
    return []
  }
}

function saveItemsToStorage(registrationTermId: string, items: CourseBinItem[]): void {
  const key = storageKeyForTerm(registrationTermId)
  if (key == null) return
  try {
    localStorage.setItem(key, JSON.stringify(items))
  } catch {
    /* ignore quota / private mode */
  }
}

function findItemByKey(
  items: CourseBinItem[],
  key: string,
): CourseBinItem | undefined {
  return items.find(
    (x) => courseBinSectionKey(x.course_code, x.section, x.schedule_track) === key,
  )
}

type CourseBinProviderProps = {
  children: ReactNode
  registrationTermId: string
  /** Logged-in student id; empty when signed out (localStorage draft only). */
  studentId: string
}

export function CourseBinProvider({
  children,
  registrationTermId,
  studentId,
}: CourseBinProviderProps) {
  const term = registrationTermId.trim()
  const sid = studentId.trim()
  const [items, setItems] = useState<CourseBinItem[]>(() =>
    term === '' ? [] : loadItemsFromStorage(term),
  )
  const [hydrating, setHydrating] = useState(false)
  const hydrateGenRef = useRef(0)

  const persistCache = useCallback(
    (next: CourseBinItem[]) => {
      if (term === '') return
      saveItemsToStorage(term, next)
    },
    [term],
  )

  useEffect(() => {
    if (term === '') {
      setItems([])
      setHydrating(false)
      return
    }

    const cached = loadItemsFromStorage(term)
    setItems(cached)

    if (sid === '') {
      setHydrating(false)
      return
    }

    const gen = ++hydrateGenRef.current
    setHydrating(true)
    const ac = new AbortController()

    void (async () => {
      try {
        let serverItems = await loadCourseBinFromServer(sid, term, {
          signal: ac.signal,
        })
        if (ac.signal.aborted || hydrateGenRef.current !== gen) return

        if (serverItems.length === 0 && cached.length > 0) {
          serverItems = await syncLocalCourseBinToServer(sid, term, cached)
          if (ac.signal.aborted || hydrateGenRef.current !== gen) return
        }

        setItems(serverItems)
        persistCache(serverItems)
      } catch (e) {
        if (ac.signal.aborted || hydrateGenRef.current !== gen) return
        console.warn('[course-bin] hydrate failed; using local cache', e)
        setItems(cached)
      } finally {
        if (!ac.signal.aborted && hydrateGenRef.current === gen) {
          setHydrating(false)
        }
      }
    })()

    return () => ac.abort()
  }, [term, sid, persistCache])

  const addToCourseBin = useCallback(
    (item: CourseBinItem) => {
      const normalizedItem = normalizeCourseBinItem(item)
      const code = normalizedItem.course_code.trim()
      if (code === '') return

      const key = courseBinSectionKey(
        normalizedItem.course_code,
        normalizedItem.section,
        normalizedItem.schedule_track,
      )

      setItems((prev) => {
        if (
          prev.some(
            (x) =>
              courseBinSectionKey(x.course_code, x.section, x.schedule_track) === key,
          )
        ) {
          return prev
        }
        const next = [...prev, normalizedItem]
        persistCache(next)
        return next
      })

      if (term === '' || sid === '') return

      void (async () => {
        try {
          const saved = await saveCourseBinItemToServer(sid, normalizedItem, term)
          setItems((prev) => {
            const withoutDup = prev.filter(
              (x) =>
                courseBinSectionKey(x.course_code, x.section, x.schedule_track) !== key,
            )
            const next = [...withoutDup, saved]
            persistCache(next)
            return next
          })
        } catch (e) {
          console.error('[course-bin] add failed; rolling back', e)
          setItems((prev) => {
            const next = prev.filter(
              (x) =>
                courseBinSectionKey(x.course_code, x.section, x.schedule_track) !== key,
            )
            persistCache(next)
            return next
          })
        }
      })()
    },
    [persistCache, sid, term],
  )

  const removeFromCourseBin = useCallback(
    (courseCode: string, section: string, scheduleTrack?: 'EN' | 'CN') => {
      const key = courseBinSectionKey(courseCode, section, scheduleTrack)
      let removedItem: CourseBinItem | undefined

      setItems((prev) => {
        removedItem = findItemByKey(prev, key)
        const next = prev.filter(
          (x) => courseBinSectionKey(x.course_code, x.section, x.schedule_track) !== key,
        )
        persistCache(next)
        return next
      })

      if (term === '' || sid === '' || removedItem?.id == null) return

      const itemId = removedItem.id
      void (async () => {
        try {
          await removeCourseBinItemFromServer(sid, itemId)
        } catch (e) {
          console.error('[course-bin] remove failed; restoring item', e)
          setItems((prev) => {
            if (findItemByKey(prev, key) != null) return prev
            const next = [...prev, { ...removedItem!, id: itemId }]
            persistCache(next)
            return next
          })
        }
      })()
    },
    [persistCache, sid, term],
  )

  const clearCourseBin = useCallback(async () => {
    setItems([])
    if (term !== '') {
      persistCache([])
    }
    if (term === '' || sid === '') return
    try {
      await clearCourseBinOnServer(sid, term)
    } catch (e) {
      console.error('[course-bin] clear failed', e)
    }
  }, [persistCache, sid, term])

  const value = useMemo(
    () => ({
      items,
      hydrating,
      addToCourseBin,
      removeFromCourseBin,
      clearCourseBin,
    }),
    [items, hydrating, addToCourseBin, removeFromCourseBin, clearCourseBin],
  )

  return <CourseBinContext.Provider value={value}>{children}</CourseBinContext.Provider>
}

export function useCourseBin(): CourseBinContextValue {
  const ctx = useContext(CourseBinContext)
  if (!ctx) {
    throw new Error('useCourseBin must be used within a CourseBinProvider')
  }
  return ctx
}
