import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type CourseBinItem = {
  course_code: string
  eng_name: string
  chi_name: string
  units: string
  section: string
  session: string
  type: string
  registered: string
  time: string
  days: string
  instructor: string
  location: string
}

type CourseBinContextValue = {
  items: CourseBinItem[]
  addToCourseBin: (item: CourseBinItem) => void
  removeFromCourseBin: (courseCode: string, section: string) => void
}

const CourseBinContext = createContext<CourseBinContextValue | null>(null)

function courseSectionKey(courseCode: string, section: string): string {
  return `${courseCode.trim().toLowerCase()}|${section.trim().toLowerCase()}`
}

export function CourseBinProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CourseBinItem[]>([])

  const addToCourseBin = useCallback((item: CourseBinItem) => {
    const code = item.course_code.trim()
    if (code === '') return

    setItems((prev) => {
      const key = courseSectionKey(item.course_code, item.section)
      if (prev.some((x) => courseSectionKey(x.course_code, x.section) === key)) {
        return prev
      }
      return [...prev, item]
    })
  }, [])

  const removeFromCourseBin = useCallback((courseCode: string, section: string) => {
    const key = courseSectionKey(courseCode, section)
    setItems((prev) => prev.filter((x) => courseSectionKey(x.course_code, x.section) !== key))
  }, [])

  const value = useMemo(
    () => ({
      items,
      addToCourseBin,
      removeFromCourseBin,
    }),
    [items, addToCourseBin, removeFromCourseBin],
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
