import type { Quiz } from '../../../data/documentQuizzes'
import type { StudentDocumentRequirement } from '../../../lib/api'
import { QuizForm } from './QuizForm'

type QuizCardProps = {
  quiz: Quiz
  expanded: boolean
  completed: boolean
  requirement: StudentDocumentRequirement | undefined
  answers: Record<string, string>
  certificationChecked: boolean
  submitting: boolean
  submitError: string | null
  onToggleExpand: () => void
  onAnswerChange: (questionId: string, option: string) => void
  onCertificationChange: (next: boolean) => void
  onSubmit: () => void
}

export function QuizCard({
  quiz,
  expanded,
  completed,
  requirement,
  answers,
  certificationChecked,
  submitting,
  submitError,
  onToggleExpand,
  onAnswerChange,
  onCertificationChange,
  onSubmit,
}: QuizCardProps) {
  const toggleLabel = expanded ? 'Close' : 'Start Quiz'

  const statusLabel =
    requirement == null ? '—' : requirement.status === 'completed' ? 'Completed' : 'Assigned'

  const submittedAt = requirement?.submittedAt ?? null

  const scoreHint =
    !completed &&
    requirement?.scoreCorrect != null &&
    requirement.totalQuestions != null &&
    requirement.totalQuestions > 0
      ? `Last score: ${requirement.scoreCorrect} / ${requirement.totalQuestions}. All questions must be correct to complete this requirement.`
      : null

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
            Status: <strong>{statusLabel}</strong>
            {completed && submittedAt ? (
              <>
                {' '}
                · Submitted {new Date(submittedAt).toLocaleString()}
              </>
            ) : null}
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
            scoreHint={scoreHint}
            onAnswerChange={onAnswerChange}
            onCertificationChange={onCertificationChange}
            onSubmit={onSubmit}
          />
        </div>
      ) : null}
    </article>
  )
}
