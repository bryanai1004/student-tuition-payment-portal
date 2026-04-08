import { useCallback, useRef, useState } from 'react'
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
  const submitInFlightRef = useRef(false)

  const completedByQuiz: Record<QuizId, boolean> = {
    ferpa: requirementsByQuiz.ferpa?.status === 'completed',
    titleix: requirementsByQuiz.titleix?.status === 'completed',
    campus: requirementsByQuiz.campus?.status === 'completed',
  }

  const handleToggleExpand = useCallback((qid: QuizId) => {
    setExpandedQuizId((prev) => (prev === qid ? null : qid))
    setErrorByQuiz((prev) => ({ ...prev, [qid]: null }))
  }, [])

  const handleSubmit = useCallback(
    async (quizId: QuizId) => {
      if (requirementsByQuiz[quizId]?.status === 'completed') return
      if (submitInFlightRef.current) return
      const answers = answersByQuiz[quizId] ?? {}
      setErrorByQuiz((prev) => ({ ...prev, [quizId]: null }))
      submitInFlightRef.current = true
      setSubmittingQuizId(quizId)
      try {
        await submitStudentDocumentQuiz(
          studentId,
          quizId as DocumentQuizRequirementType,
          { academicTermId, answers },
        )
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
        requirementsByQuiz={requirementsByQuiz}
        submittingQuizId={submittingQuizId}
        errorByQuiz={errorByQuiz}
        onToggleExpand={handleToggleExpand}
        onAnswerChange={(quizId, questionId, option) => {
          setAnswersByQuiz((prev) => ({
            ...prev,
            [quizId]: {
              ...(prev[quizId] ?? {}),
              [questionId]: option,
            },
          }))
          setErrorByQuiz((p) => ({ ...p, [quizId]: null }))
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
