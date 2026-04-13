export type AdminRole = 'admin' | 'teacher' | 'clinical_teacher'

export type AdminModuleKey =
  | 'students'
  | 'clinical'
  | 'courses'
  | 'academic_terms'
  | 'course_sections'
  | 'scheduling_timetable'
  | 'finance'

export type AdminModuleDefinition = {
  key: AdminModuleKey
  label: string
  path: string
  end?: boolean
  schedulingContext?: boolean
}

export const ADMIN_MODULES: readonly AdminModuleDefinition[] = [
  { key: 'students', label: 'Students', path: '/admin/students' },
  { key: 'clinical', label: 'Clinical', path: '/admin/clinical' },
  { key: 'courses', label: 'Courses', path: '/admin/courses' },
  { key: 'academic_terms', label: 'Academic Terms', path: '/admin/academic-terms' },
  {
    key: 'course_sections',
    label: 'Course Sections',
    path: '/admin/course-sections',
    end: true,
    schedulingContext: true,
  },
  {
    key: 'scheduling_timetable',
    label: 'Scheduling Timetable',
    path: '/admin/course-sections/timetable',
    schedulingContext: true,
  },
  { key: 'finance', label: 'Finance', path: '/admin/finance' },
] as const

const ROLE_MODULE_ACCESS: Record<AdminRole, readonly AdminModuleKey[]> = {
  admin: ADMIN_MODULES.map((module) => module.key),
  teacher: ['courses', 'course_sections', 'scheduling_timetable'],
  clinical_teacher: ['clinical', 'finance'],
}

export function getAllowedAdminModules(role: AdminRole): readonly AdminModuleKey[] {
  return ROLE_MODULE_ACCESS[role]
}

export function hasAdminModuleAccess(role: AdminRole, module: AdminModuleKey): boolean {
  return ROLE_MODULE_ACCESS[role].includes(module)
}

export function getFirstAccessibleAdminPath(role: AdminRole): string {
  const firstModule = ADMIN_MODULES.find((module) => hasAdminModuleAccess(role, module.key))
  return firstModule?.path ?? '/admin/students'
}
