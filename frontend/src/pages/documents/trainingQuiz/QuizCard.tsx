import type { Quiz } from '../../../data/documentQuizzes'
import { QuizForm } from './QuizForm'

type QuizCardProps = {
  quiz: Quiz
  expanded: boolean
  completed: boolean
  answers: Record<string, string>
  certificationChecked: boolean
  submitting: boolean
  submitError: string | null
  incorrectQuestionIds: string[]
  onToggleExpand: () => void
  onAnswerChange: (questionId: string, option: string) => void
  onCertificationChange: (next: boolean) => void
  onSubmit: () => void
}

export function QuizCard({
  quiz,
  expanded,
  completed,
  answers,
  certificationChecked,
  submitting,
  submitError,
  incorrectQuestionIds,
  onToggleExpand,
  onAnswerChange,
  onCertificationChange,
  onSubmit,
}: QuizCardProps) {
  const toggleLabel = expanded ? 'Close' : 'Start Quiz'

  const submittedLabel = completed ? 'Submitted: Yes' : 'Submitted: No'

  return (
    <article
      className="portal-doc-quiz-entry-card"
      aria-expanded={expanded}
    >
      <div className="portal-doc-quiz-entry-card__row">
        <div className="portal-doc-quiz-entry-card__text">
          <h3 className="portal-doc-quiz-entry-card__title">{quiz.title}</h3>
          <p className="portal-doc-quiz-entry-card__desc">{quiz.description}</p>
          <p className="portal-inline-note portal-inline-note--flush">
            <strong>{submittedLabel}</strong>
          </p>
        </div>
        <div className="portal-doc-quiz-entry-card__aside">
          {completed ? (
            <span className="portal-doc-quiz-entry-card__completed" aria-label="Completed">
              Completed
            </span>
          ) : null}
          <button
            type="button"
            className="portal-btn portal-btn--secondary portal-doc-quiz-row__action"
            aria-expanded={expanded}
            aria-controls={`doc-quiz-expand-${quiz.id}`}
            id={`doc-quiz-trigger-${quiz.id}`}
            disabled={submitting}
            onClick={onToggleExpand}
          >
            {toggleLabel}
          </button>
        </div>
      </div>
      {submitError ? (
        <p className="portal-inline-note portal-inline-note--flush" role="alert">
          {submitError}
        </p>
      ) : null}
      {expanded ? (
        <div
          id={`doc-quiz-expand-${quiz.id}`}
          role="region"
          aria-labelledby={`doc-quiz-trigger-${quiz.id}`}
          className="portal-doc-quiz-entry-card__expand"
        >
          <QuizForm
            quiz={quiz}
            answers={answers}
            certificationChecked={certificationChecked}
            completed={completed}
            submitting={submitting}
            incorrectQuestionIds={incorrectQuestionIds}
            onAnswerChange={onAnswerChange}
            onCertificationChange={onCertificationChange}
            onSubmit={onSubmit}
          />
        </div>
      ) : null}
    </article>
  )
}
