import { useCallback, useState } from 'react'
import {
  DOCUMENT_QUIZZES,
  type QuizId,
} from '../../../data/documentQuizzes'
import { submitDocumentQuiz } from '../../../lib/documentQuizSubmit'
import {
  readAllQuizCompletedFromStorage,
  writeQuizCompletedToStorage,
} from '../../../lib/documentQuizStorage'
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

export function QuizSection() {
  const [expandedQuizId, setExpandedQuizId] = useState<QuizId | null>(null)
  const [answersByQuiz, setAnswersByQuiz] =
    useState<Record<QuizId, Record<string, string>>>(emptyAnswers)
  const [certifiedByQuiz, setCertifiedByQuiz] =
    useState<Record<QuizId, boolean>>(initialCertified)
  const [completedByQuiz, setCompletedByQuiz] = useState<
    Record<QuizId, boolean>
  >(() => readAllQuizCompletedFromStorage())

  const handleToggleExpand = useCallback(
    (qid: QuizId) => {
      setExpandedQuizId((prev) => (prev === qid ? null : qid))
    },
    [],
  )

  const handleSubmit = useCallback(
    async (quizId: QuizId) => {
      const answers = answersByQuiz[quizId] ?? {}
      const certified = certifiedByQuiz[quizId] ?? false
      await submitDocumentQuiz({
        quizId,
        answers,
        certified,
        submittedAt: new Date().toISOString(),
      })
      writeQuizCompletedToStorage(quizId)
      setCompletedByQuiz((prev) => ({ ...prev, [quizId]: true }))
    },
    [answersByQuiz, certifiedByQuiz],
  )

  return (
    <div className="portal-documents-quiz-page">
      <QuizEntrySection
        quizzes={DOCUMENT_QUIZZES}
        expandedQuizId={expandedQuizId}
        completedByQuiz={completedByQuiz}
        answersByQuiz={answersByQuiz}
        certifiedByQuiz={certifiedByQuiz}
        onToggleExpand={handleToggleExpand}
        onAnswerChange={(quizId, questionId, option) => {
          setAnswersByQuiz((prev) => ({
            ...prev,
            [quizId]: {
              ...(prev[quizId] ?? {}),
              [questionId]: option,
            },
          }))
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
