import type { Quiz, QuizId } from '../../../data/documentQuizzes'
import { QuizCard } from './QuizCard'

type QuizEntrySectionProps = {
  quizzes: Quiz[]
  expandedQuizId: QuizId | null
  completedByQuiz: Record<QuizId, boolean>
  answersByQuiz: Record<QuizId, Record<string, string>>
  certifiedByQuiz: Record<QuizId, boolean>
  submittingQuizId: QuizId | null
  errorByQuiz: Record<QuizId, string | null>
  incorrectQuestionIdsByQuiz: Record<QuizId, string[]>
  onToggleExpand: (id: QuizId) => void
  onAnswerChange: (quizId: QuizId, questionId: string, option: string) => void
  onCertifiedChange: (quizId: QuizId, next: boolean) => void
  onSubmit: (quizId: QuizId) => void
}

export function QuizEntrySection({
  quizzes,
  expandedQuizId,
  completedByQuiz,
  answersByQuiz,
  certifiedByQuiz,
  submittingQuizId,
  errorByQuiz,
  incorrectQuestionIdsByQuiz,
  onToggleExpand,
  onAnswerChange,
  onCertifiedChange,
  onSubmit,
}: QuizEntrySectionProps) {
  return (
    <div className="portal-doc-quiz-entry-section">
      <ul className="portal-doc-quiz-entry-list">
        {quizzes.map((quiz) => (
          <li key={quiz.id}>
            <QuizCard
              quiz={quiz}
              expanded={expandedQuizId === quiz.id}
              completed={completedByQuiz[quiz.id] ?? false}
              answers={answersByQuiz[quiz.id] ?? {}}
              certificationChecked={certifiedByQuiz[quiz.id] ?? false}
              submitting={submittingQuizId === quiz.id}
              submitError={errorByQuiz[quiz.id] ?? null}
              incorrectQuestionIds={incorrectQuestionIdsByQuiz[quiz.id] ?? []}
              onToggleExpand={() => onToggleExpand(quiz.id)}
              onAnswerChange={(qid, opt) => onAnswerChange(quiz.id, qid, opt)}
              onCertificationChange={(next) => onCertifiedChange(quiz.id, next)}
              onSubmit={() => onSubmit(quiz.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
