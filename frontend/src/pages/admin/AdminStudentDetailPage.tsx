import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  createAdminStudentLoa,
  fetchAcademicTerms,
  fetchAdminStudentClinicalProgress,
  fetchAdminStudentAcademicRecords,
  fetchAdminStudentDetail,
  fetchAdminStudentPhotoUrl,
  fetchAdminStudentDocuments,
  fetchCurrentAcademicTerm,
  fetchStudentProgramProgress,
  resetAdminStudentDocumentRequirement,
  resetAllAdminStudentDocuments,
  uploadAdminStudentPhoto,
  type AcademicTerm,
  type AdminStudentDetail,
  type AdminStudentRegistrationHistoryRow,
  type AdminStudentRegistrationTermOption,
  type DocumentRequirementType,
  type StudentClinicalProgressResponse,
  type StudentDocumentsResponse,
  type StudentProgramProgressResponse,
} from '../../lib/api'
import { useStudentPortalT } from '../../LanguageContext'
import { ProgramProgressPanel } from '../../components/academics/ProgramProgressPanel'
import { groupRowsByTermYear } from '../../lib/academicsTranscriptDisplay'
import { socket, type EnrollmentChangedEvent } from '../../lib/socket'

function dashText(value: string | null | undefined): string {
  const s = value?.trim() ?? ''
  return s.length > 0 ? s : '—'
}

function formatUsMdY(iso: string | null | undefined): string {
  const s = iso?.trim() ?? ''
  if (!s) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) {
    const [, y, mo, d] = m
    return `${mo}/${d}/${y}`
  }
  const d = new Date(s.includes('T') ? s : `${s}T12:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yy = d.getFullYear()
  return `${mm}/${dd}/${yy}`
}

function formatEntryYear(y: number | null | undefined): string {
  if (y == null || !Number.isFinite(y)) return '—'
  return String(Math.trunc(y))
}

function formatExamTermCell(term: string | null, year: number | null): string {
  const t = term?.trim() ?? ''
  const hasYear = year != null && Number.isFinite(year)
  if (!t && !hasYear) return '—'
  if (t && hasYear) return `${t} ${year}`
  if (t) return t
  return String(year)
}

const ADMIN_DOC_REQUIREMENT_ORDER: DocumentRequirementType[] = [
  'ferpa',
  'titleix',
  'campus',
  'copyright_release_agreement',
]

const ADMIN_DOC_LABELS: Record<DocumentRequirementType, string> = {
  ferpa: 'FERPA Quiz',
  titleix: 'Title IX Quiz',
  campus: 'Campus Safety Quiz',
  copyright_release_agreement: 'Copyright Release Agreement',
}

/** Visible terms first when any exist; otherwise full list. Newest by `sequence_no`, then year, then quarter. */
function academicTermsForAdminDocPicker(terms: AcademicTerm[]): AcademicTerm[] {
  const visible = terms.filter((t) => t.is_visible)
  const pool = visible.length > 0 ? visible : terms
  return [...pool].sort((a, b) => {
    if (b.sequence_no !== a.sequence_no) return b.sequence_no - a.sequence_no
    if (b.year !== a.year) return b.year - a.year
    return b.quarter_index - a.quarter_index
  })
}

/**
 * Default academic term for admin documents: latest registration label match, else registration-open
 * current term, else most recent visible (or all terms if none visible).
 */
function pickDefaultDocumentsAcademicTermId(
  terms: AcademicTerm[],
  latestRegistrationTermLabel: string | null,
  currentRegistrationOpen: AcademicTerm | null,
): string | null {
  if (terms.length === 0) return null
  const pickerList = academicTermsForAdminDocPicker(terms)
  const label = latestRegistrationTermLabel?.trim()
  if (label) {
    const match =
      terms.find((t) => t.term_label === label) ??
      pickerList.find((t) => t.term_label === label)
    if (match) return match.id
  }
  if (currentRegistrationOpen) {
    const match = terms.find((t) => t.id === currentRegistrationOpen.id)
    if (match) return match.id
  }
  return pickerList[0]?.id ?? null
}

function registrationTermKey(term: string, year: number): string {
  return `${Math.trunc(year)}::${term.trim().toUpperCase()}`
}

function parseLatestRegistrationTermLabel(
  label: string | null | undefined,
): AdminStudentRegistrationTermOption | null {
  const text = label?.trim() ?? ''
  if (!text) return null
  const m = /^(.*\S)\s+(\d{4})$/.exec(text)
  if (!m) return null
  const term = m[1].trim()
  const year = Number.parseInt(m[2], 10)
  if (!term || !Number.isFinite(year)) return null
  return { term, year, label: text }
}

const LOA_QUARTER_OPTIONS = ['Winter', 'Spring', 'Summer', 'Fall'] as const

const STUDENT_PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024
const STUDENT_PHOTO_ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
])

const EMPTY_LOA_FORM = {
  loaQuarter: '',
  loaYear: '',
  plannedReturnQuarter: '',
  plannedReturnYear: '',
  reason: '',
}

function buildLoaYearOptions(now = new Date()): string[] {
  const currentYear = now.getFullYear()
  const out: string[] = []
  for (let year = currentYear - 2; year <= currentYear + 4; year += 1) {
    out.push(String(year))
  }
  return out
}

function cellHistory(
  item: AdminStudentRegistrationHistoryRow,
  key: keyof AdminStudentRegistrationHistoryRow,
): string {
  const v = item[key]
  if (v === undefined || v === null) return '—'
  if (typeof v === 'number') return String(v)
  const s = v.trim()
  return s.length > 0 ? s : '—'
}

function profileInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return 'ID'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase()
}

export function AdminStudentDetailPage() {
  const { studentId: studentIdParam } = useParams<{ studentId: string }>()
  const studentId = studentIdParam ?? ''
  const t = useStudentPortalT()

  const [detail, setDetail] = useState<AdminStudentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [academicRecordsReloadKey, setAcademicRecordsReloadKey] = useState(0)
  const [activeTab, setActiveTab] = useState<
    'registration' | 'profile' | 'documents' | 'clinical-progress'
  >('registration')
  const [registrationTerms, setRegistrationTerms] = useState<
    AdminStudentRegistrationTermOption[]
  >([])
  const [selectedRegistrationTermKey, setSelectedRegistrationTermKey] =
    useState('')
  const [registrationAllHistoryRows, setRegistrationAllHistoryRows] = useState<
    AdminStudentRegistrationHistoryRow[]
  >([])
  const [registrationHistoryLoading, setRegistrationHistoryLoading] =
    useState(false)
  const [registrationHistoryError, setRegistrationHistoryError] = useState<
    string | null
  >(null)

  const [docTerms, setDocTerms] = useState<AcademicTerm[] | null>(null)
  const [docTermsLoading, setDocTermsLoading] = useState(false)
  const [docTermsError, setDocTermsError] = useState<string | null>(null)
  const [docCurrentRegistrationTerm, setDocCurrentRegistrationTerm] =
    useState<AcademicTerm | null>(null)
  /** When set, Documents tab uses this academic term id instead of the default. */
  const [documentsTermOverride, setDocumentsTermOverride] = useState<
    string | null
  >(null)

  const [documentsData, setDocumentsData] =
    useState<StudentDocumentsResponse | null>(null)
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const [documentsActionError, setDocumentsActionError] = useState<
    string | null
  >(null)
  const [clinicalProgressData, setClinicalProgressData] =
    useState<StudentClinicalProgressResponse | null>(null)
  const [clinicalProgressLoading, setClinicalProgressLoading] = useState(false)
  const [clinicalProgressError, setClinicalProgressError] = useState<string | null>(
    null,
  )
  const [programProgress, setProgramProgress] =
    useState<StudentProgramProgressResponse | null>(null)
  const [programProgressLoading, setProgramProgressLoading] = useState(false)
  const [programProgressError, setProgramProgressError] = useState<string | null>(null)
  const [programProgressReloadKey, setProgramProgressReloadKey] = useState(0)
  const [resettingRequirement, setResettingRequirement] =
    useState<DocumentRequirementType | null>(null)
  const [resettingAllDocuments, setResettingAllDocuments] = useState(false)
  const [loaSelection, setLoaSelection] = useState<'no' | 'yes'>('no')
  const [loaCreateFormOpen, setLoaCreateFormOpen] = useState(false)
  const [loaForm, setLoaForm] = useState(EMPTY_LOA_FORM)
  const [loaSaveError, setLoaSaveError] = useState<string | null>(null)
  const [loaSaving, setLoaSaving] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [photoNotice, setPhotoNotice] = useState<string | null>(null)

  useEffect(() => {
    setActiveTab('registration')
    setRegistrationTerms([])
    setSelectedRegistrationTermKey('')
    setRegistrationAllHistoryRows([])
    setRegistrationHistoryLoading(false)
    setRegistrationHistoryError(null)
    setDocTerms(null)
    setDocTermsLoading(false)
    setDocTermsError(null)
    setDocCurrentRegistrationTerm(null)
    setDocumentsTermOverride(null)
    setDocumentsData(null)
    setDocumentsLoading(false)
    setDocumentsError(null)
    setDocumentsActionError(null)
    setClinicalProgressData(null)
    setClinicalProgressLoading(false)
    setClinicalProgressError(null)
    setProgramProgress(null)
    setProgramProgressLoading(false)
    setProgramProgressError(null)
    setProgramProgressReloadKey(0)
    setResettingRequirement(null)
    setResettingAllDocuments(false)
    setLoaSelection('no')
    setLoaCreateFormOpen(false)
    setLoaForm(EMPTY_LOA_FORM)
    setLoaSaveError(null)
    setLoaSaving(false)
    setPhotoUrl(null)
    setPhotoPath(null)
    setPhotoLoading(false)
    setPhotoUploading(false)
    setPhotoError(null)
    setPhotoNotice(null)
    setAcademicRecordsReloadKey(0)
  }, [studentId])

  useEffect(() => {
    const hasLoa = detail?.loaSummary.hasLoa === true
    setLoaSelection(hasLoa ? 'yes' : 'no')
    setLoaCreateFormOpen(false)
    setLoaForm(EMPTY_LOA_FORM)
    setLoaSaveError(null)
  }, [detail?.loaSummary.hasLoa, studentId])

  useEffect(() => {
    if (!studentId.trim()) {
      setDetail(null)
      setLoading(false)
      setError('Missing student id.')
      return
    }

    const ac = new AbortController()
    setDetail(null)
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const d = await fetchAdminStudentDetail(studentId, {
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setDetail(d)
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setDetail(null)
        setError(
          e instanceof Error ? e.message : 'Could not load student.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
        }
      }
    })()

    return () => ac.abort()
  }, [studentId, reloadKey])

  useEffect(() => {
    const currentStudentId = studentId.trim()
    if (!currentStudentId) return
    const handleEnrollmentChanged = (event: EnrollmentChangedEvent) => {
      if (event.type !== 'enrollment.changed') return
      if ((event.studentId ?? '').trim() !== currentStudentId) return
      setAcademicRecordsReloadKey((k) => k + 1)
    }
    socket.connect()
    socket.on('enrollment.changed', handleEnrollmentChanged)
    return () => {
      socket.off('enrollment.changed', handleEnrollmentChanged)
    }
  }, [studentId])

  useEffect(() => {
    if (!studentId.trim()) return
    if (activeTab !== 'registration') {
      setRegistrationHistoryLoading(false)
      return
    }
    const ac = new AbortController()
    setRegistrationTerms([])
    setRegistrationAllHistoryRows([])
    setRegistrationHistoryLoading(true)
    setRegistrationHistoryError(null)
    ;(async () => {
      try {
        const payload = await fetchAdminStudentAcademicRecords(studentId, {
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        const rows = payload.enrollmentHistory
          .map((item): AdminStudentRegistrationHistoryRow | null => {
            const term = item.term?.trim() ?? ''
            const year = Number.isFinite(item.year)
              ? Math.trunc(item.year)
              : Number.NaN
            if (!term || !Number.isFinite(year)) return null
            return {
              courseCode: item.courseCode?.trim() ?? '',
              courseTitle: item.courseTitle?.trim() || null,
              section: null,
              units:
                typeof item.credits === 'number' && Number.isFinite(item.credits)
                  ? item.credits
                  : null,
              status: item.status?.trim() || null,
              term,
              year,
              termLabel: `${term} ${year}`,
            }
          })
          .filter(
            (row): row is AdminStudentRegistrationHistoryRow => row !== null,
          )
        setRegistrationAllHistoryRows(rows)
        const availableTerms = payload.availableTerms
          .map((item): AdminStudentRegistrationTermOption | null => {
            const term = item.term?.trim() ?? ''
            const year = Number.isFinite(item.year)
              ? Math.trunc(item.year)
              : Number.NaN
            if (!term || !Number.isFinite(year)) return null
            const label = item.label?.trim() || `${term} ${year}`
            return { term, year, label }
          })
          .filter(
            (item): item is AdminStudentRegistrationTermOption => item !== null,
          )
        const terms =
          availableTerms.length > 0
            ? availableTerms
            : groupRowsByTermYear(rows).map((g) => ({
                term: g.term,
                year: g.year,
                label: `${g.term} ${g.year}`,
              }))
        setRegistrationTerms(terms)
      } catch (e) {
        if (ac.signal.aborted) return
        setRegistrationTerms([])
        setRegistrationAllHistoryRows([])
        setRegistrationHistoryError(
          e instanceof Error ? e.message : 'Could not load academic records.',
        )
      } finally {
        if (!ac.signal.aborted) setRegistrationHistoryLoading(false)
      }
    })()
    return () => ac.abort()
  }, [studentId, academicRecordsReloadKey, activeTab])

  const registrationFallbackTerm = useMemo(
    () => parseLatestRegistrationTermLabel(detail?.latestRegistrationTerm),
    [detail?.latestRegistrationTerm],
  )

  const registrationTermOptions = useMemo(() => {
    if (registrationTerms.length > 0) return registrationTerms
    return registrationFallbackTerm ? [registrationFallbackTerm] : []
  }, [registrationTerms, registrationFallbackTerm])

  const selectedRegistrationTerm = useMemo(() => {
    if (registrationTermOptions.length === 0) return null
    return (
      registrationTermOptions.find(
        (opt) => registrationTermKey(opt.term, opt.year) === selectedRegistrationTermKey,
      ) ?? null
    )
  }, [registrationTermOptions, selectedRegistrationTermKey])

  useEffect(() => {
    if (registrationTermOptions.length === 0) {
      setSelectedRegistrationTermKey('')
      return
    }
    if (selectedRegistrationTerm) return
    const defaultTerm = registrationTermOptions[0]
    if (!defaultTerm) return
    setSelectedRegistrationTermKey(
      registrationTermKey(defaultTerm.term, defaultTerm.year),
    )
  }, [registrationTermOptions, selectedRegistrationTerm])

  const registrationHistoryRows = useMemo(() => {
    if (!selectedRegistrationTerm) return []
    return registrationAllHistoryRows.filter(
      (row) =>
        row.year === selectedRegistrationTerm.year &&
        row.term.trim().toLowerCase() ===
          selectedRegistrationTerm.term.trim().toLowerCase(),
    )
  }, [registrationAllHistoryRows, selectedRegistrationTerm])

  const defaultDocumentsTermId = useMemo(() => {
    if (!docTerms || docTerms.length === 0) return null
    return pickDefaultDocumentsAcademicTermId(
      docTerms,
      detail?.latestRegistrationTerm ?? null,
      docCurrentRegistrationTerm,
    )
  }, [docTerms, detail?.latestRegistrationTerm, docCurrentRegistrationTerm])

  const effectiveDocumentsTermId = useMemo(() => {
    if (documentsTermOverride) {
      const ok = docTerms?.some((t) => t.id === documentsTermOverride)
      if (ok) return documentsTermOverride
    }
    return defaultDocumentsTermId
  }, [documentsTermOverride, docTerms, defaultDocumentsTermId])

  const documentsTermOptions = useMemo(() => {
    if (!docTerms || docTerms.length === 0) return []
    return academicTermsForAdminDocPicker(docTerms)
  }, [docTerms])

  useEffect(() => {
    if (activeTab !== 'documents' || !studentId.trim() || !detail) return
    if (docTerms !== null) return
    const ac = new AbortController()
    setDocTermsLoading(true)
    setDocTermsError(null)
    ;(async () => {
      try {
        const [terms, current] = await Promise.all([
          fetchAcademicTerms({ signal: ac.signal }),
          fetchCurrentAcademicTerm({ signal: ac.signal }),
        ])
        if (ac.signal.aborted) return
        setDocTerms(terms)
        setDocCurrentRegistrationTerm(current)
      } catch (e) {
        if (ac.signal.aborted) return
        setDocTerms(null)
        setDocCurrentRegistrationTerm(null)
        setDocTermsError(
          e instanceof Error ? e.message : 'Could not load academic terms.',
        )
      } finally {
        if (!ac.signal.aborted) setDocTermsLoading(false)
      }
    })()
    return () => ac.abort()
  }, [activeTab, studentId, detail, docTerms])

  const loadDocumentsForTerm = useCallback(
    async (termId: string, signal?: AbortSignal) => {
      return fetchAdminStudentDocuments(studentId, termId, { signal })
    },
    [studentId],
  )

  useEffect(() => {
    if (activeTab !== 'documents' || !studentId.trim()) return
    const termId = effectiveDocumentsTermId
    if (!termId) {
      setDocumentsData(null)
      setDocumentsLoading(false)
      setDocumentsError(null)
      return
    }
    const ac = new AbortController()
    setDocumentsLoading(true)
    setDocumentsError(null)
    ;(async () => {
      try {
        const data = await loadDocumentsForTerm(termId, ac.signal)
        if (ac.signal.aborted) return
        setDocumentsData(data)
      } catch (e) {
        if (ac.signal.aborted) return
        setDocumentsData(null)
        setDocumentsError(
          e instanceof Error
            ? e.message
            : 'Could not load document requirements.',
        )
      } finally {
        if (!ac.signal.aborted) setDocumentsLoading(false)
      }
    })()
    return () => ac.abort()
  }, [activeTab, studentId, effectiveDocumentsTermId, loadDocumentsForTerm])

  useEffect(() => {
    if (activeTab !== 'clinical-progress' || !studentId.trim()) return
    const ac = new AbortController()
    setClinicalProgressLoading(true)
    setClinicalProgressError(null)
    ;(async () => {
      try {
        const data = await fetchAdminStudentClinicalProgress(studentId, {
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setClinicalProgressData(data)
      } catch (e) {
        if (ac.signal.aborted) return
        setClinicalProgressData(null)
        setClinicalProgressError(
          e instanceof Error ? e.message : 'Could not load clinical progress.',
        )
      } finally {
        if (!ac.signal.aborted) setClinicalProgressLoading(false)
      }
    })()
    return () => ac.abort()
  }, [activeTab, studentId, reloadKey])

  useEffect(() => {
    if (activeTab !== 'profile' || !studentId.trim()) return
    const ac = new AbortController()
    setProgramProgressLoading(true)
    setProgramProgressError(null)
    ;(async () => {
      try {
        const data = await fetchStudentProgramProgress(studentId, {
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setProgramProgress(data)
      } catch (e) {
        if (ac.signal.aborted) return
        setProgramProgress(null)
        setProgramProgressError(
          e instanceof Error ? e.message : 'Could not load program progress.',
        )
      } finally {
        if (!ac.signal.aborted) setProgramProgressLoading(false)
      }
    })()
    return () => ac.abort()
  }, [activeTab, studentId, programProgressReloadKey])

  useEffect(() => {
    if (activeTab !== 'profile' || !detail || !studentId.trim()) {
      if (activeTab !== 'profile') {
        setPhotoLoading(false)
      }
      return
    }
    const ac = new AbortController()
    setPhotoLoading(true)
    setPhotoError(null)
    ;(async () => {
      try {
        const payload = await fetchAdminStudentPhotoUrl(studentId, {
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setPhotoPath(payload.photoPath)
        setPhotoUrl(payload.photoUrl)
      } catch (e) {
        if (ac.signal.aborted) return
        setPhotoPath(null)
        setPhotoUrl(null)
        setPhotoError(e instanceof Error ? e.message : 'Could not load photo.')
      } finally {
        if (!ac.signal.aborted) setPhotoLoading(false)
      }
    })()
    return () => ac.abort()
  }, [activeTab, detail, studentId])

  const refreshDocumentsAfterMutation = useCallback(async () => {
    const termId = effectiveDocumentsTermId
    if (!termId || !studentId.trim()) return
    setDocumentsError(null)
    try {
      const data = await fetchAdminStudentDocuments(studentId, termId)
      setDocumentsData(data)
    } catch (e) {
      setDocumentsError(
        e instanceof Error ? e.message : 'Could not reload document requirements.',
      )
    }
  }, [effectiveDocumentsTermId, studentId])

  const handleResetDocumentRequirement = useCallback(
    async (requirementType: DocumentRequirementType) => {
      const termId = effectiveDocumentsTermId
      if (!termId || !studentId.trim()) return
      setDocumentsActionError(null)
      setResettingRequirement(requirementType)
      try {
        await resetAdminStudentDocumentRequirement(
          studentId,
          requirementType,
          { academicTermId: termId },
        )
        await refreshDocumentsAfterMutation()
      } catch (e) {
        setDocumentsActionError(
          e instanceof Error ? e.message : 'Could not re-assign this requirement.',
        )
      } finally {
        setResettingRequirement(null)
      }
    },
    [effectiveDocumentsTermId, studentId, refreshDocumentsAfterMutation],
  )

  const handleResetAllDocumentRequirements = useCallback(async () => {
    const termId = effectiveDocumentsTermId
    if (!termId || !studentId.trim()) return
    setDocumentsActionError(null)
    setResettingAllDocuments(true)
    try {
      await resetAllAdminStudentDocuments(studentId, {
        academicTermId: termId,
      })
      await refreshDocumentsAfterMutation()
    } catch (e) {
      setDocumentsActionError(
        e instanceof Error ? e.message : 'Could not re-assign all requirements.',
      )
    } finally {
      setResettingAllDocuments(false)
    }
  }, [effectiveDocumentsTermId, studentId, refreshDocumentsAfterMutation])

  const sectionLoading = loading && detail === null && error === null

  const documentsBusy =
    documentsLoading ||
    resettingAllDocuments ||
    resettingRequirement !== null

  const loaYearOptions = useMemo(() => buildLoaYearOptions(), [])
  const hasExistingLoa = detail?.loaSummary.hasLoa === true
  const showLoaCreateForm = loaSelection === 'yes' && loaCreateFormOpen
  const hasPhoto = Boolean(photoUrl && photoUrl.trim() !== '')

  const handleLoaSelectionChange = useCallback((nextValue: 'no' | 'yes') => {
    setLoaSelection(nextValue)
    setLoaSaveError(null)
    if (nextValue === 'no') {
      setLoaCreateFormOpen(false)
      setLoaForm(EMPTY_LOA_FORM)
      return
    }
    setLoaCreateFormOpen(true)
  }, [])

  const handleOpenLoaCreateForm = useCallback(() => {
    setLoaSelection('yes')
    setLoaCreateFormOpen(true)
    setLoaSaveError(null)
  }, [])

  const handleLoaCreateCancel = useCallback(() => {
    setLoaCreateFormOpen(false)
    setLoaForm(EMPTY_LOA_FORM)
    setLoaSaveError(null)
    if (!hasExistingLoa) {
      setLoaSelection('no')
    }
  }, [hasExistingLoa])

  const handleLoaSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!studentId.trim()) {
        setLoaSaveError('Missing student id.')
        return
      }
      if (
        !loaForm.loaQuarter ||
        !loaForm.loaYear ||
        !loaForm.plannedReturnQuarter ||
        !loaForm.plannedReturnYear
      ) {
        setLoaSaveError(
          'Select LOA quarter/year and planned return quarter/year.',
        )
        return
      }
      setLoaSaveError(null)
      setLoaSaving(true)
      try {
        const nextDetail = await createAdminStudentLoa(studentId, {
          loaQuarter: loaForm.loaQuarter,
          loaYear: loaForm.loaYear,
          plannedReturnQuarter: loaForm.plannedReturnQuarter,
          plannedReturnYear: loaForm.plannedReturnYear,
          reason: loaForm.reason.trim() || null,
        })
        setDetail(nextDetail)
        setError(null)
      } catch (e) {
        setLoaSaveError(
          e instanceof Error ? e.message : 'Could not save LOA record.',
        )
      } finally {
        setLoaSaving(false)
      }
    },
    [loaForm, studentId],
  )

  const handlePhotoSelect = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null
      event.target.value = ''
      if (!file) return
      if (!STUDENT_PHOTO_ALLOWED_TYPES.has(file.type)) {
        setPhotoError('Only JPG, JPEG, PNG, and WEBP images are allowed.')
        setPhotoNotice(null)
        return
      }
      if (file.size > STUDENT_PHOTO_MAX_SIZE_BYTES) {
        setPhotoError('Photo must be 5MB or smaller.')
        setPhotoNotice(null)
        return
      }
      if (!studentId.trim()) {
        setPhotoError('Missing student id.')
        setPhotoNotice(null)
        return
      }

      setPhotoUploading(true)
      setPhotoError(null)
      setPhotoNotice(null)
      try {
        const payload = await uploadAdminStudentPhoto(studentId, file)
        setPhotoPath(payload.photoPath)
        setPhotoUrl(payload.photoUrl)
        setPhotoNotice('Photo uploaded successfully.')
      } catch (e) {
        setPhotoError(e instanceof Error ? e.message : 'Photo upload failed.')
      } finally {
        setPhotoUploading(false)
      }
    },
    [studentId],
  )

  return (
    <main className="admin-page">
      <div className="admin-page__toolbar">
        <div>
          <Link
            to="/admin/students"
            className="portal-text-muted"
            style={{ fontSize: '0.875rem', textDecoration: 'none' }}
          >
            ← Students
          </Link>
          <h1 className="admin-page__title admin-page__title--inline">
            {detail?.name ?? 'Student'}
          </h1>
        </div>
        {detail ? (
          <div className="admin-page__toolbar-actions">
            <Link
              to={`/admin/students/${encodeURIComponent(detail.studentId)}/edit`}
              className="portal-btn portal-btn--primary"
            >
              Edit
            </Link>
          </div>
        ) : null}
      </div>

      {sectionLoading ? (
        <section
          className="portal-card portal-profile-state"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Loading student</p>
          <p className="portal-profile-state__detail">
            Please wait while we load this record from the school database.
          </p>
        </section>
      ) : null}

      {!sectionLoading && error ? (
        <section
          className="portal-card portal-profile-state portal-profile-state--error"
          role="alert"
          aria-live="assertive"
        >
          <p className="portal-profile-state__title">We could not load this student</p>
          <p className="portal-profile-state__detail">{error}</p>
          <div className="portal-actions portal-profile-state__actions">
            <Link to="/admin/students" className="portal-btn portal-btn--secondary">
              Back to list
            </Link>
            <button
              type="button"
              className="portal-btn portal-btn--secondary"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Try again
            </button>
          </div>
        </section>
      ) : null}

      {!sectionLoading && !error && detail ? (
        <>
          <div
            className="admin-detail-tabs"
            role="tablist"
            aria-label="Student record sections"
          >
            <button
              type="button"
              role="tab"
              id="admin-student-tab-registration"
              aria-selected={activeTab === 'registration'}
              aria-controls="admin-student-panel-registration"
              tabIndex={activeTab === 'registration' ? 0 : -1}
              className={`admin-detail-tab${activeTab === 'registration' ? ' admin-detail-tab--active' : ''}`}
              onClick={() => setActiveTab('registration')}
            >
              Registration
            </button>
            <button
              type="button"
              role="tab"
              id="admin-student-tab-profile"
              aria-selected={activeTab === 'profile'}
              aria-controls="admin-student-panel-profile"
              tabIndex={activeTab === 'profile' ? 0 : -1}
              className={`admin-detail-tab${activeTab === 'profile' ? ' admin-detail-tab--active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              Profile
            </button>
            <button
              type="button"
              role="tab"
              id="admin-student-tab-documents"
              aria-selected={activeTab === 'documents'}
              aria-controls="admin-student-panel-documents"
              tabIndex={activeTab === 'documents' ? 0 : -1}
              className={`admin-detail-tab${activeTab === 'documents' ? ' admin-detail-tab--active' : ''}`}
              onClick={() => setActiveTab('documents')}
            >
              Documents
            </button>
            <button
              type="button"
              role="tab"
              id="admin-student-tab-clinical-progress"
              aria-selected={activeTab === 'clinical-progress'}
              aria-controls="admin-student-panel-clinical-progress"
              tabIndex={activeTab === 'clinical-progress' ? 0 : -1}
              className={`admin-detail-tab${activeTab === 'clinical-progress' ? ' admin-detail-tab--active' : ''}`}
              onClick={() => setActiveTab('clinical-progress')}
            >
              Clinical Progress
            </button>
          </div>

          {activeTab === 'registration' ? (
            <div
              className="portal-stack"
              style={{ gap: '1.25rem' }}
              id="admin-student-panel-registration"
              role="tabpanel"
              aria-labelledby="admin-student-tab-registration"
            >
              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-reg-summary"
              >
                <h2
                  id="admin-student-reg-summary"
                  className="portal-section-heading"
                  style={{ marginBottom: 0 }}
                >
                  Registration summary
                </h2>
                <dl>
                  <div className="portal-row">
                    <dt>Latest registration term</dt>
                    <dd>{dashText(detail.latestRegistrationTerm)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>LOA</dt>
                    <dd>
                      <div className="admin-loa-editor__toggle">
                        <select
                          aria-label="LOA"
                          className="admin-input admin-detail-quarter-select"
                          value={loaSelection}
                          disabled={loaSaving}
                          onChange={(e) =>
                            handleLoaSelectionChange(
                              e.target.value === 'yes' ? 'yes' : 'no',
                            )
                          }
                        >
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                        {hasExistingLoa ? (
                          <div className="portal-stack" style={{ gap: '0.5rem' }}>
                            <p className="portal-card-note admin-loa-editor__helper">
                              Existing LOA records stay visible here. Changing this
                              control only shows or hides the create form and does not
                              delete LOA history.
                            </p>
                            {!showLoaCreateForm ? (
                              <div className="portal-actions">
                                <button
                                  type="button"
                                  className="portal-btn portal-btn--secondary"
                                  disabled={loaSaving}
                                  onClick={handleOpenLoaCreateForm}
                                >
                                  Add LOA Record
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </dd>
                  </div>
                  <div className="portal-row">
                    <dt>LOA Term</dt>
                    <dd>{dashText(detail.loaSummary.loaTerm)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Planned Return Term</dt>
                    <dd>{dashText(detail.loaSummary.plannedReturnTerm)}</dd>
                  </div>
                  {detail.loaSummary.reason ? (
                    <div className="portal-row">
                      <dt>LOA Reason</dt>
                      <dd>{dashText(detail.loaSummary.reason)}</dd>
                    </div>
                  ) : null}
                  <div className="portal-row">
                    <dt>Signed date</dt>
                    <dd>{formatUsMdY(detail.signedDate)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Enroll start date</dt>
                    <dd>{formatUsMdY(detail.enrollStartDate)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Resolved entry date</dt>
                    <dd>{formatUsMdY(detail.resolvedEntryDate)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Entry year</dt>
                    <dd>{formatEntryYear(detail.entryYear)}</dd>
                  </div>
                </dl>
                {showLoaCreateForm ? (
                  <form className="admin-loa-editor" onSubmit={handleLoaSubmit}>
                    <p className="portal-card-note admin-loa-editor__helper">
                      Choose the LOA term and planned return term, then save to
                      create a new record in the existing LOA table.
                    </p>
                    <div className="admin-form-grid admin-loa-editor__grid">
                      <label className="admin-field">
                        <span className="admin-field__label">LOA Quarter *</span>
                        <select
                          className="admin-input"
                          value={loaForm.loaQuarter}
                          onChange={(e) =>
                            setLoaForm((current) => ({
                              ...current,
                              loaQuarter: e.target.value,
                            }))
                          }
                          disabled={loaSaving}
                        >
                          <option value="">Select…</option>
                          {LOA_QUARTER_OPTIONS.map((quarter) => (
                            <option key={quarter} value={quarter}>
                              {quarter}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="admin-field">
                        <span className="admin-field__label">LOA Year *</span>
                        <select
                          className="admin-input"
                          value={loaForm.loaYear}
                          onChange={(e) =>
                            setLoaForm((current) => ({
                              ...current,
                              loaYear: e.target.value,
                            }))
                          }
                          disabled={loaSaving}
                        >
                          <option value="">Select…</option>
                          {loaYearOptions.map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="admin-field">
                        <span className="admin-field__label">
                          Planned Return Quarter *
                        </span>
                        <select
                          className="admin-input"
                          value={loaForm.plannedReturnQuarter}
                          onChange={(e) =>
                            setLoaForm((current) => ({
                              ...current,
                              plannedReturnQuarter: e.target.value,
                            }))
                          }
                          disabled={loaSaving}
                        >
                          <option value="">Select…</option>
                          {LOA_QUARTER_OPTIONS.map((quarter) => (
                            <option key={quarter} value={quarter}>
                              {quarter}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="admin-field">
                        <span className="admin-field__label">
                          Planned Return Year *
                        </span>
                        <select
                          className="admin-input"
                          value={loaForm.plannedReturnYear}
                          onChange={(e) =>
                            setLoaForm((current) => ({
                              ...current,
                              plannedReturnYear: e.target.value,
                            }))
                          }
                          disabled={loaSaving}
                        >
                          <option value="">Select…</option>
                          {loaYearOptions.map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="admin-field admin-field--span-2">
                        <span className="admin-field__label">Reason</span>
                        <textarea
                          className="admin-input admin-textarea"
                          value={loaForm.reason}
                          onChange={(e) =>
                            setLoaForm((current) => ({
                              ...current,
                              reason: e.target.value,
                            }))
                          }
                          disabled={loaSaving}
                          rows={3}
                        />
                      </label>
                    </div>
                    {loaSaveError ? (
                      <p className="admin-loa-editor__error" role="alert">
                        {loaSaveError}
                      </p>
                    ) : null}
                    <div className="admin-form-actions">
                      <button
                        type="submit"
                        className="portal-btn portal-btn--primary"
                        disabled={loaSaving}
                      >
                        {loaSaving ? 'Saving LOA…' : 'Save LOA'}
                      </button>
                      <button
                        type="button"
                        className="portal-btn portal-btn--secondary"
                        disabled={loaSaving}
                        onClick={handleLoaCreateCancel}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </section>

              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-reg-history"
              >
                <h2
                  id="admin-student-reg-history"
                  className="portal-section-heading"
                >
                  Registration history
                </h2>
                <div className="admin-detail-field-row">
                  <label
                    className="admin-detail-field-label"
                    htmlFor="admin-student-quarter-select"
                  >
                    Quarter
                  </label>
                  <select
                    id="admin-student-quarter-select"
                    className="admin-input admin-detail-quarter-select"
                    value={selectedRegistrationTerm?.term ? selectedRegistrationTermKey : ''}
                    onChange={(e) => setSelectedRegistrationTermKey(e.target.value)}
                    disabled={
                      registrationTermOptions.length === 0 || registrationHistoryLoading
                    }
                  >
                    {registrationTermOptions.length === 0 ? (
                      <option value="">No terms on file</option>
                    ) : (
                      registrationTermOptions.map((termOption) => {
                        const optionKey = registrationTermKey(
                          termOption.term,
                          termOption.year,
                        )
                        return (
                          <option key={optionKey} value={optionKey}>
                            {termOption.label}
                          </option>
                        )
                      })
                    )}
                  </select>
                </div>
                {registrationHistoryLoading ? (
                  <p className="portal-card-note admin-detail-empty" aria-busy="true">
                    Loading academic records…
                  </p>
                ) : null}
                {registrationHistoryError ? (
                  <p
                    className="portal-card-note admin-detail-empty"
                    role="alert"
                    style={{ color: '#b42318' }}
                  >
                    {registrationHistoryError}
                  </p>
                ) : null}
                {selectedRegistrationTerm && registrationHistoryLoading ? (
                  <p className="portal-card-note admin-detail-empty" aria-busy="true">
                    Loading registration history…
                  </p>
                ) : null}
                {selectedRegistrationTerm &&
                !registrationHistoryLoading &&
                !registrationHistoryError &&
                registrationHistoryRows.length === 0 ? (
                  <p
                    className="portal-card-note admin-detail-empty"
                    role="status"
                  >
                    No registration records for this term.
                  </p>
                ) : (
                  selectedRegistrationTerm &&
                  !registrationHistoryLoading &&
                  !registrationHistoryError &&
                  registrationHistoryRows.length > 0 ? (
                    <div className="portal-table-wrap admin-table-wrap">
                      <table className="portal-table portal-data-table admin-registration-history-table">
                        <thead>
                          <tr>
                            <th scope="col">Course code</th>
                            <th scope="col">Course title</th>
                            <th scope="col">Section</th>
                            <th scope="col">Units</th>
                            <th scope="col">Status</th>
                            <th scope="col">Term</th>
                            <th scope="col">Year</th>
                          </tr>
                        </thead>
                        <tbody>
                          {registrationHistoryRows.map((row, idx) => (
                            <tr
                              key={`${row.courseCode}-${row.term}-${row.year}-${row.section ?? 'na'}-${idx}`}
                            >
                              <td>{cellHistory(row, 'courseCode')}</td>
                              <td>{cellHistory(row, 'courseTitle')}</td>
                              <td>{cellHistory(row, 'section')}</td>
                              <td>{cellHistory(row, 'units')}</td>
                              <td>{cellHistory(row, 'status')}</td>
                              <td>{cellHistory(row, 'termLabel')}</td>
                              <td>{cellHistory(row, 'year')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null
                )}
              </section>

              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-reg-refs"
              >
                <h2
                  id="admin-student-reg-refs"
                  className="portal-section-heading"
                >
                  Academic registration references
                </h2>
                <dl>
                  <div className="portal-row">
                    <dt>Requirements ID</dt>
                    <dd>{dashText(detail.requirementsId)}</dd>
                  </div>
                </dl>
              </section>
            </div>
          ) : null}

          {activeTab === 'profile' ? (
            <div
              className="portal-stack"
              style={{ gap: '1.25rem' }}
              id="admin-student-panel-profile"
              role="tabpanel"
              aria-labelledby="admin-student-tab-profile"
            >
              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-identity"
              >
                <h2 id="admin-student-identity" className="portal-section-heading">
                  Identity
                </h2>
                <div className="admin-student-profile-layout">
                  <section
                    className="portal-profile-photo-card admin-student-profile-photo-card"
                    aria-labelledby="admin-profile-photo-heading"
                  >
                    <h3
                      id="admin-profile-photo-heading"
                      className="portal-section-heading"
                    >
                      Profile Photo
                    </h3>
                    <div className="portal-profile-photo-frame">
                      {hasPhoto ? (
                        <img
                          src={photoUrl ?? ''}
                          alt={`${detail.name} photo`}
                          className="portal-profile-photo-image"
                        />
                      ) : (
                        <span className="portal-profile-photo-placeholder portal-profile-photo-placeholder--initials">
                          {profileInitials(detail.name)}
                        </span>
                      )}
                    </div>
                    <label className="portal-btn portal-btn--secondary portal-profile-photo-upload">
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={handlePhotoSelect}
                        className="portal-profile-photo-upload-input"
                        disabled={photoUploading || photoLoading}
                      />
                      {photoUploading
                        ? 'Uploading...'
                        : hasPhoto
                          ? 'Replace Photo'
                          : 'Upload Photo'}
                    </label>
                    <p className="portal-card-note">
                      {photoLoading
                        ? 'Loading photo...'
                        : hasPhoto
                          ? 'Stored in secure private bucket.'
                          : 'No photo uploaded yet.'}
                    </p>
                    {photoPath ? (
                      <p className="portal-card-note portal-profile-photo-filename">
                        Path: {photoPath}
                      </p>
                    ) : null}
                    {photoNotice ? (
                      <p className="portal-card-note" style={{ color: '#1f6f43' }}>
                        {photoNotice}
                      </p>
                    ) : null}
                    {photoError ? (
                      <p className="portal-card-note" role="alert" style={{ color: '#b42318' }}>
                        {photoError}
                      </p>
                    ) : null}
                  </section>
                  <dl className="admin-student-profile-details">
                  <div className="portal-row">
                    <dt>Student ID</dt>
                    <dd>{dashText(detail.studentId)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Division</dt>
                    <dd>{dashText(detail.division)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Name</dt>
                    <dd>{dashText(detail.name)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Gender</dt>
                    <dd>{dashText(detail.gender)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Email</dt>
                    <dd>{dashText(detail.email)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Program</dt>
                    <dd>{detail.program}</dd>
                  </div>
                  </dl>
                </div>
              </section>

              <div className="portal-stack portal-academics-program-progress-outer">
                <ProgramProgressPanel
                  t={t}
                  loading={programProgressLoading}
                  error={programProgressError}
                  progress={programProgress}
                  onRetry={() => setProgramProgressReloadKey((k) => k + 1)}
                />
              </div>

              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-academic-bg"
              >
                <h2
                  id="admin-student-academic-bg"
                  className="portal-section-heading"
                >
                  Academic background
                </h2>
                <dl>
                  <div className="portal-row">
                    <dt>Highest degree</dt>
                    <dd>{dashText(detail.highestDegree)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Background school</dt>
                    <dd>{dashText(detail.backgroundSchool)}</dd>
                  </div>
                </dl>
              </section>

              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-contact"
              >
                <h2 id="admin-student-contact" className="portal-section-heading">
                  Contact information
                </h2>
                <dl>
                  <div className="portal-row">
                    <dt>Address</dt>
                    <dd>{dashText(detail.address)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>City</dt>
                    <dd>{dashText(detail.city)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>State</dt>
                    <dd>{dashText(detail.state)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Zip</dt>
                    <dd>{dashText(detail.zip)}</dd>
                  </div>
                </dl>
              </section>

              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-sensitive"
              >
                <h2 id="admin-student-sensitive" className="portal-section-heading">
                  Additional profile details
                </h2>
                <dl>
                  <div className="portal-row">
                    <dt>Date of Birth</dt>
                    <dd>{formatUsMdY(detail.dob)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>SSN</dt>
                    <dd>{dashText(detail.ssn)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Visa</dt>
                    <dd>{dashText(detail.visa)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Phone 1</dt>
                    <dd>{dashText(detail.phone1)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Phone 2</dt>
                    <dd>{dashText(detail.phone2)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Phone 3</dt>
                    <dd>{dashText(detail.phone3)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Citizenship</dt>
                    <dd>{dashText(detail.citizenship)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Race</dt>
                    <dd>{dashText(detail.race)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Marital Status</dt>
                    <dd>{dashText(detail.marital)}</dd>
                  </div>
                </dl>
              </section>
            </div>
          ) : null}

          {activeTab === 'documents' ? (
            <div
              className="portal-stack"
              style={{ gap: '1.25rem' }}
              id="admin-student-panel-documents"
              role="tabpanel"
              aria-labelledby="admin-student-tab-documents"
            >
              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-documents-heading"
              >
                <h2
                  id="admin-student-documents-heading"
                  className="portal-section-heading"
                  style={{ marginBottom: 0 }}
                >
                  Document & training compliance
                </h2>
                <p className="portal-card-note" style={{ marginTop: 0 }}>
                  Status and quiz results are shown for the selected academic term. Re-assign
                  clears completion so the student must finish the item again in the portal.
                </p>

                {docTermsLoading ? (
                  <div
                    className="portal-card portal-profile-state"
                    aria-busy="true"
                    aria-live="polite"
                  >
                    <p className="portal-profile-state__title">
                      Loading academic terms
                    </p>
                    <p className="portal-profile-state__detail">
                      Choose a term to load document requirements.
                    </p>
                  </div>
                ) : null}

                {!docTermsLoading && docTermsError ? (
                  <div
                    className="portal-card-note"
                    role="alert"
                    style={{
                      border: '1px solid var(--portal-border-subtle)',
                      borderLeft: '3px solid #c53030',
                      background: '#fff5f5',
                      color: '#742a2a',
                    }}
                  >
                    {docTermsError}
                  </div>
                ) : null}

                {!docTermsLoading && !docTermsError ? (
                  <>
                    <div className="admin-detail-field-row">
                      <label
                        className="admin-detail-field-label"
                        htmlFor="admin-student-documents-term-select"
                      >
                        Academic term
                      </label>
                      <select
                        id="admin-student-documents-term-select"
                        className="admin-input admin-detail-quarter-select"
                        value={effectiveDocumentsTermId ?? ''}
                        onChange={(e) => {
                          const v = e.target.value
                          setDocumentsActionError(null)
                          setDocumentsTermOverride(v === '' ? null : v)
                        }}
                        disabled={
                          documentsTermOptions.length === 0 || documentsBusy
                        }
                      >
                        {documentsTermOptions.length === 0 ? (
                          <option value="">No terms available</option>
                        ) : (
                          documentsTermOptions.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.term_label}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    {!effectiveDocumentsTermId &&
                    documentsTermOptions.length === 0 ? (
                      <p
                        className="portal-card-note admin-detail-empty"
                        role="status"
                      >
                        No academic terms are available to load document
                        requirements.
                      </p>
                    ) : null}

                    {!effectiveDocumentsTermId &&
                    documentsTermOptions.length > 0 ? (
                      <p
                        className="portal-card-note admin-detail-empty"
                        role="status"
                      >
                        Select an academic term to view document requirements.
                      </p>
                    ) : null}

                    {documentsError ? (
                      <div
                        className="portal-card-note"
                        role="alert"
                        style={{
                          border: '1px solid var(--portal-border-subtle)',
                          borderLeft: '3px solid #c53030',
                          background: '#fff5f5',
                          color: '#742a2a',
                        }}
                      >
                        {documentsError}
                      </div>
                    ) : null}

                    {documentsActionError ? (
                      <div
                        className="portal-card-note"
                        role="alert"
                        style={{
                          border: '1px solid var(--portal-border-subtle)',
                          borderLeft: '3px solid #c53030',
                          background: '#fff5f5',
                          color: '#742a2a',
                        }}
                      >
                        {documentsActionError}
                      </div>
                    ) : null}

                    {effectiveDocumentsTermId ? (
                      <div className="portal-actions" style={{ flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="portal-btn portal-btn--secondary"
                          disabled={
                            documentsBusy || !effectiveDocumentsTermId
                          }
                          onClick={() => void handleResetAllDocumentRequirements()}
                        >
                          {resettingAllDocuments
                            ? 'Re-assigning all…'
                            : 'Re-assign all'}
                        </button>
                      </div>
                    ) : null}

                    {effectiveDocumentsTermId && documentsLoading ? (
                      <p className="portal-card-note admin-detail-empty" aria-busy="true">
                        Loading document requirements…
                      </p>
                    ) : null}

                    {effectiveDocumentsTermId &&
                    !documentsLoading &&
                    documentsData
                      ? ADMIN_DOC_REQUIREMENT_ORDER.map((reqType) => {
                          const req = documentsData.requirements.find(
                            (r) => r.requirementType === reqType,
                          )
                          const title = ADMIN_DOC_LABELS[reqType]
                          const submittedYes = req?.status === 'completed'
                          const singleBusy = resettingRequirement === reqType
                          return (
                            <div
                              key={reqType}
                              className="portal-stack"
                              style={{
                                gap: '0.75rem',
                                paddingTop: '0.75rem',
                                borderTop:
                                  '1px solid var(--portal-border-subtle)',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  alignItems: 'center',
                                  gap: '0.75rem',
                                }}
                              >
                                <h3
                                  className="portal-section-heading"
                                  style={{
                                    fontSize: '1rem',
                                    margin: 0,
                                    flex: '1 1 12rem',
                                  }}
                                >
                                  {title}
                                </h3>
                                <button
                                  type="button"
                                  className="portal-btn portal-btn--secondary"
                                  disabled={
                                    !effectiveDocumentsTermId || documentsBusy
                                  }
                                  onClick={() =>
                                    void handleResetDocumentRequirement(
                                      reqType,
                                    )
                                  }
                                >
                                  {singleBusy ? 'Re-assigning…' : 'Re-assign'}
                                </button>
                              </div>
                              <dl style={{ margin: 0 }}>
                                <div className="portal-row">
                                  <dt>Submitted</dt>
                                  <dd>{submittedYes ? 'Yes' : 'No'}</dd>
                                </div>
                              </dl>
                            </div>
                          )
                        })
                      : null}
                  </>
                ) : null}
              </section>
            </div>
          ) : null}

          {activeTab === 'clinical-progress' ? (
            <div
              className="portal-stack"
              style={{ gap: '1.25rem' }}
              id="admin-student-panel-clinical-progress"
              role="tabpanel"
              aria-labelledby="admin-student-tab-clinical-progress"
            >
              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-clinical-progress-summary"
              >
                <h2
                  id="admin-student-clinical-progress-summary"
                  className="portal-section-heading"
                >
                  Clinical progress summary
                </h2>
                {clinicalProgressLoading ? (
                  <p className="portal-card-note admin-detail-empty" aria-busy="true">
                    Loading clinical progress…
                  </p>
                ) : null}
                {clinicalProgressError ? (
                  <p
                    className="portal-card-note admin-detail-empty"
                    role="alert"
                    style={{ color: '#b42318' }}
                  >
                    {clinicalProgressError}
                  </p>
                ) : null}
                {!clinicalProgressLoading &&
                !clinicalProgressError &&
                !clinicalProgressData ? (
                  <p className="portal-card-note admin-detail-empty" role="status">
                    No clinical progress data available.
                  </p>
                ) : null}
                {!clinicalProgressLoading &&
                !clinicalProgressError &&
                clinicalProgressData ? (
                  <dl>
                    <div className="portal-row">
                      <dt>Completed Clinics</dt>
                      <dd>{clinicalProgressData.completedCount}</dd>
                    </div>
                    <div className="portal-row">
                      <dt>Total Clinical Hours</dt>
                      <dd>{clinicalProgressData.totalHours}</dd>
                    </div>
                  </dl>
                ) : null}
              </section>

              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-clinical-progress-records"
              >
                <h2
                  id="admin-student-clinical-progress-records"
                  className="portal-section-heading"
                >
                  Clinic details
                </h2>
                {!clinicalProgressLoading &&
                !clinicalProgressError &&
                clinicalProgressData ? (
                  clinicalProgressData.records.length === 0 ? (
                    <p className="portal-card-note admin-detail-empty" role="status">
                      No completed clinic records.
                    </p>
                  ) : (
                    <div className="portal-table-wrap admin-table-wrap">
                      <table className="portal-table portal-data-table">
                        <thead>
                          <tr>
                            <th scope="col">Code</th>
                            <th scope="col">Course Title</th>
                            <th scope="col">Term</th>
                            <th scope="col">Hours</th>
                            <th scope="col">Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clinicalProgressData.records.map((row, idx) => (
                            <tr key={`${row.code}-${row.term}-${row.year}-${idx}`}>
                              <td>{row.code || '—'}</td>
                              <td>{row.courseTitle || '—'}</td>
                              <td>
                                {row.term} {row.year}
                              </td>
                              <td>{row.hours}</td>
                              <td>{row.grade || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : null}
              </section>

              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-clinical-progress-exams"
              >
                <h2
                  id="admin-student-clinical-progress-exams"
                  className="portal-section-heading"
                >
                  Clinical exam history
                </h2>
                {!clinicalProgressLoading &&
                !clinicalProgressError &&
                clinicalProgressData ? (
                  clinicalProgressData.exams.length === 0 ? (
                    <p className="portal-card-note admin-detail-empty" role="status">
                      No clinical exam history records.
                    </p>
                  ) : (
                    <div className="portal-table-wrap admin-table-wrap">
                      <table className="portal-table portal-data-table">
                        <thead>
                          <tr>
                            <th scope="col">Exam</th>
                            <th scope="col">Term</th>
                            <th scope="col">Status</th>
                            <th scope="col">Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clinicalProgressData.exams.map((row) => (
                            <tr key={row.code}>
                              <td>{row.examName}</td>
                              <td>{formatExamTermCell(row.term, row.year)}</td>
                              <td>{row.status}</td>
                              <td>{row.grade?.trim() ? row.grade : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : null}
              </section>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  )
}
