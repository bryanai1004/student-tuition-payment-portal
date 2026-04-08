import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import { fetchStudentDocuments, type StudentDocumentRequirement } from '../../lib/api'
import { AgreementsSection } from './components/AgreementsSection'
import { DocumentsTabs, type DocumentsTabId } from './components/DocumentsTabs'
import { QuizSection } from './components/QuizSection'
import { RegistrationFormsSection } from './components/RegistrationFormsSection'
import { resolveDocumentsAcademicTerm } from './resolveDocumentsAcademicTerm'

type DocsBootstrapState =
  | { phase: 'idle' | 'loading' }
  | { phase: 'error'; message: string }
  | {
      phase: 'ready'
      academicTermId: string
      termLabel: string
      requirements: StudentDocumentRequirement[]
    }

export function DocumentsHomePage() {
  const { currentStudentId, isAuthenticated } = useAccount()
  const [tab, setTab] = useState<DocumentsTabId>('registration')
  const [docs, setDocs] = useState<DocsBootstrapState>(() =>
    currentStudentId?.trim() ? { phase: 'loading' } : { phase: 'idle' },
  )
  const termSnapshotRef = useRef<{ id: string; label: string }>({ id: '', label: '' })

  const refreshDocuments = useCallback(async () => {
    const sid = currentStudentId?.trim()
    const tid = termSnapshotRef.current.id.trim()
    if (!sid || !tid) {
      console.debug('[documents] refresh skipped: missing studentId or academicTermId snapshot', {
        sid: Boolean(sid),
        tid: tid || '(empty)',
      })
      return
    }
    try {
      console.debug('[documents] refreshDocuments → fetchStudentDocuments', { sid, tid })
      const payload = await fetchStudentDocuments(sid, tid)
      termSnapshotRef.current = {
        id: payload.academicTermId,
        label: termSnapshotRef.current.label,
      }
      setDocs((prev) => {
        if (prev.phase !== 'ready') return prev
        return {
          ...prev,
          academicTermId: payload.academicTermId,
          requirements: payload.requirements,
        }
      })
    } catch (e) {
      console.debug(
        '[documents] refresh failed after submit (requirements unchanged)',
        e instanceof Error ? e.message : e,
      )
    }
  }, [currentStudentId])

  useEffect(() => {
    const sid = currentStudentId?.trim()
    if (!sid) {
      termSnapshotRef.current = { id: '', label: '' }
      setDocs({ phase: 'idle' })
      return
    }
    const ac = new AbortController()
    setDocs({ phase: 'loading' })
    void (async () => {
      try {
        const term = await resolveDocumentsAcademicTerm({ signal: ac.signal })
        if (ac.signal.aborted) return
        console.debug('[documents] mount effect → fetchStudentDocuments', {
          sid,
          academicTermId: term.id,
        })
        const payload = await fetchStudentDocuments(sid, term.id, {
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        // Keep snapshot ID aligned with GET/POST document APIs (server canonical term id).
        termSnapshotRef.current = { id: payload.academicTermId, label: term.term_label }
        setDocs({
          phase: 'ready',
          academicTermId: payload.academicTermId,
          termLabel: term.term_label,
          requirements: payload.requirements,
        })
      } catch (e) {
        if (ac.signal.aborted) return
        const message =
          e instanceof Error ? e.message : 'Could not load document requirements.'
        setDocs({ phase: 'error', message })
      }
    })()
    return () => ac.abort()
  }, [currentStudentId])

  const agreementRequirement = useMemo(() => {
    if (docs.phase !== 'ready') return undefined
    return docs.requirements.find((r) => r.requirementType === 'copyright_release_agreement')
  }, [docs])

  const quizRequirements = useMemo(() => {
    if (docs.phase !== 'ready') {
      return {
        ferpa: undefined,
        titleix: undefined,
        campus: undefined,
      } as Record<'ferpa' | 'titleix' | 'campus', StudentDocumentRequirement | undefined>
    }
    const map = {
      ferpa: undefined,
      titleix: undefined,
      campus: undefined,
    } as Record<'ferpa' | 'titleix' | 'campus', StudentDocumentRequirement | undefined>
    for (const r of docs.requirements) {
      if (r.requirementType === 'ferpa') map.ferpa = r
      if (r.requirementType === 'titleix') map.titleix = r
      if (r.requirementType === 'campus') map.campus = r
    }
    return map
  }, [docs])

  const showTabs = isAuthenticated && (docs.phase === 'ready' || docs.phase === 'error')

  return (
    <main className="portal-page portal-documents-home">
      {!isAuthenticated ? (
        <p className="portal-page-lede">Sign in to view documents and forms for your account.</p>
      ) : null}

      {isAuthenticated && docs.phase === 'error' ? (
        <div
          className="portal-card portal-profile-state portal-profile-state--error"
          role="alert"
        >
          <p className="portal-profile-state__detail">{docs.message}</p>
        </div>
      ) : null}

      {isAuthenticated && docs.phase === 'ready' ? (
        <p className="portal-inline-note portal-inline-note--flush">
          Requirements for <strong>{docs.termLabel}</strong> (academic term).
        </p>
      ) : null}

      {showTabs ? <DocumentsTabs active={tab} onChange={setTab} /> : null}
      <div className="portal-documents-home__panel">
        {!isAuthenticated ? null : docs.phase === 'loading' ? (
          <p className="portal-page-lede" role="status">
            Loading document requirements…
          </p>
        ) : docs.phase === 'error' ? (
          <>
            {tab === 'registration' ? <RegistrationFormsSection /> : null}
            {tab !== 'registration' ? (
              <p className="portal-page-lede" role="status">
                Quiz and agreement actions are unavailable until document requirements load
                successfully.
              </p>
            ) : null}
          </>
        ) : docs.phase === 'ready' ? (
          <>
            {tab === 'registration' ? <RegistrationFormsSection /> : null}
            {tab === 'quiz' && currentStudentId ? (
              <QuizSection
                studentId={currentStudentId.trim()}
                academicTermId={docs.academicTermId}
                requirementsByQuiz={quizRequirements}
                onRefresh={refreshDocuments}
              />
            ) : null}
            {tab === 'agreements' && currentStudentId ? (
              <AgreementsSection
                studentId={currentStudentId.trim()}
                academicTermId={docs.academicTermId}
                requirement={agreementRequirement}
                onRefresh={refreshDocuments}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  )
}
