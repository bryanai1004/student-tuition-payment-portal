import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DOCUMENT_QUIZZES,
  type QuizId,
} from '../../../data/documentQuizzes'
import {
  submitStudentDocumentQuiz,
  type DocumentQuizRequirementType,
  type StudentDocumentRequirement,
} from '../../../lib/api'
import { QuizEntrySection } from '../trainingQuiz/QuizEntrySection'

const emptyAnswers = (): Record<QuizId, Record<string, string>> => ({
  ferpa: {},
  titleix: {},
  campus: {},
})

const initialCertified = (): Record<QuizId, boolean> => ({
  ferpa: false,
  titleix: false,
  campus: false,
})

const emptyIncorrectByQuiz = (): Record<QuizId, string[]> => ({
  ferpa: [],
  titleix: [],
  campus: [],
})

type QuizSectionProps = {
  studentId: string
  academicTermId: string
  requirementsByQuiz: Record<QuizId, StudentDocumentRequirement | undefined>
  onRefresh: () => Promise<void>
}

export function QuizSection({
  studentId,
  academicTermId,
  requirementsByQuiz,
  onRefresh,
}: QuizSectionProps) {
  const [expandedQuizId, setExpandedQuizId] = useState<QuizId | null>(null)
  const [answersByQuiz, setAnswersByQuiz] =
    useState<Record<QuizId, Record<string, string>>>(emptyAnswers)
  const [certifiedByQuiz, setCertifiedByQuiz] =
    useState<Record<QuizId, boolean>>(initialCertified)
  const [submittingQuizId, setSubmittingQuizId] = useState<QuizId | null>(null)
  const [errorByQuiz, setErrorByQuiz] = useState<Record<QuizId, string | null>>({
    ferpa: null,
    titleix: null,
    campus: null,
  })
  const [incorrectQuestionIdsByQuiz, setIncorrectQuestionIdsByQuiz] =
    useState<Record<QuizId, string[]>>(emptyIncorrectByQuiz)
  const submitInFlightRef = useRef(false)

  const completedByQuiz: Record<QuizId, boolean> = {
    ferpa: requirementsByQuiz.ferpa?.status === 'completed',
    titleix: requirementsByQuiz.titleix?.status === 'completed',
    campus: requirementsByQuiz.campus?.status === 'completed',
  }

  useEffect(() => {
    setIncorrectQuestionIdsByQuiz((prev) => {
      let next = prev
      const qids: QuizId[] = ['ferpa', 'titleix', 'campus']
      for (const qid of qids) {
        if (requirementsByQuiz[qid]?.status === 'completed' && prev[qid].length > 0) {
          if (next === prev) next = { ...prev }
          next[qid] = []
        }
      }
      return next
    })
  }, [requirementsByQuiz])

  const handleToggleExpand = useCallback((qid: QuizId) => {
    setExpandedQuizId((prev) => (prev === qid ? null : qid))
    setErrorByQuiz((prev) => ({ ...prev, [qid]: null }))
  }, [])

  const handleSubmit = useCallback(
    async (quizId: QuizId) => {
      if (requirementsByQuiz[quizId]?.status === 'completed') return
      if (submitInFlightRef.current) return
      const sid = studentId.trim()
      const tid = academicTermId.trim()
      if (!sid || !tid) {
        setErrorByQuiz((prev) => ({
          ...prev,
          [quizId]: 'Missing student or term. Reload the page and try again.',
        }))
        return
      }
      const answers = answersByQuiz[quizId] ?? {}
      setErrorByQuiz((prev) => ({ ...prev, [quizId]: null }))
      submitInFlightRef.current = true
      setSubmittingQuizId(quizId)
      try {
        console.debug(
          '[documents] quiz submit → POST /documents/quizzes/:quizId/submit',
          { studentId: sid, academicTermId: tid, quizId, answers },
        )
        const res = await submitStudentDocumentQuiz(
          sid,
          quizId as DocumentQuizRequirementType,
          { academicTermId: tid, answers },
        )
        console.debug('[documents] quiz submit ← response', res)
        setIncorrectQuestionIdsByQuiz((prev) => ({
          ...prev,
          [quizId]: res.isPassed ? [] : [...res.incorrectQuestionIds],
        }))
        await onRefresh()
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Could not submit the quiz. Try again.'
        setErrorByQuiz((prev) => ({ ...prev, [quizId]: message }))
      } finally {
        submitInFlightRef.current = false
        setSubmittingQuizId(null)
      }
    },
    [academicTermId, answersByQuiz, onRefresh, requirementsByQuiz, studentId],
  )

  return (
    <div className="portal-documents-quiz-page">
      <QuizEntrySection
        quizzes={DOCUMENT_QUIZZES}
        expandedQuizId={expandedQuizId}
        completedByQuiz={completedByQuiz}
        answersByQuiz={answersByQuiz}
        certifiedByQuiz={certifiedByQuiz}
        submittingQuizId={submittingQuizId}
        errorByQuiz={errorByQuiz}
        onToggleExpand={handleToggleExpand}
        incorrectQuestionIdsByQuiz={incorrectQuestionIdsByQuiz}
        onAnswerChange={(quizId, questionId, option) => {
          setAnswersByQuiz((prev) => ({
            ...prev,
            [quizId]: {
              ...(prev[quizId] ?? {}),
              [questionId]: option,
            },
          }))
          setErrorByQuiz((p) => ({ ...p, [quizId]: null }))
          setIncorrectQuestionIdsByQuiz((prev) => {
            const ids = prev[quizId] ?? []
            if (!ids.includes(questionId)) return prev
            return {
              ...prev,
              [quizId]: ids.filter((id) => id !== questionId),
            }
          })
        }}
        onCertifiedChange={(quizId, next) => {
          setCertifiedByQuiz((prev) => ({ ...prev, [quizId]: next }))
        }}
        onSubmit={(quizId) => {
          void handleSubmit(quizId)
        }}
      />
    </div>
  )
}
