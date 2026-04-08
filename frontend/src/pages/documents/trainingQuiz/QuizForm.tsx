import { useMemo } from 'react'
import type { Quiz } from '../../../data/documentQuizzes'
import { CertificationCheckbox } from './CertificationCheckbox'
import { QuizQuestion } from './QuizQuestion'
import { SubmitButton } from './SubmitButton'

const CERT_CHECKBOX_LABEL =
  'I certify that I have completed this training and understand the policy requirements.'

const VALIDATION_HINT =
  'Please answer all questions and confirm certification before submitting.'

type QuizFormProps = {
  quiz: Quiz
  answers: Record<string, string>
  certificationChecked: boolean
  completed: boolean
  submitting: boolean
  scoreHint: string | null
  onAnswerChange: (questionId: string, option: string) => void
  onCertificationChange: (next: boolean) => void
  onSubmit: () => void
}

export function QuizForm({
  quiz,
  answers,
  certificationChecked,
  completed,
  submitting,
  scoreHint,
  onAnswerChange,
  onCertificationChange,
  onSubmit,
}: QuizFormProps) {
  const allAnswered = useMemo(
    () => quiz.questions.every((q) => Boolean(answers[q.id]?.trim())),
    [quiz.questions, answers],
  )

  const canSubmit =
    allAnswered && certificationChecked && !completed && !submitting
  const checkboxId = `doc-quiz-cert-${quiz.id}`

  return (
    <div className="portal-doc-quiz-expand-form">
      <form
        className="portal-doc-quiz-expand-form__inner"
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit) {
            console.debug('[documents] quiz form: submitting', { quizId: quiz.id })
            onSubmit()
          }
        }}
        noValidate
      >
        {scoreHint ? (
          <p className="portal-inline-note portal-inline-note--flush" role="status">
            {scoreHint}
          </p>
        ) : null}

        <div className="portal-doc-quiz-questions">
          {quiz.questions.map((q, index) => (
            <QuizQuestion
              key={q.id}
              quizId={quiz.id}
              question={q}
              index={index}
              value={answers[q.id]}
              onChange={onAnswerChange}
              disabled={completed || submitting}
            />
          ))}
        </div>

        <CertificationCheckbox
          certificationText={quiz.certificationText}
          checkboxLabel={CERT_CHECKBOX_LABEL}
          checked={certificationChecked}
          onChange={onCertificationChange}
          disabled={completed || submitting}
          checkboxId={checkboxId}
        />

        {!completed && (!allAnswered || !certificationChecked) ? (
          <p className="portal-doc-quiz-hint" role="status">
            {VALIDATION_HINT}
          </p>
        ) : null}

        <div className="portal-doc-quiz-actions">
          <SubmitButton disabled={completed || !canSubmit} loading={submitting}>
            {completed ? 'Submitted' : submitting ? 'Submitting…' : 'Submit'}
          </SubmitButton>
        </div>
      </form>
    </div>
  )
}
