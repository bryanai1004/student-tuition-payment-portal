import type { DocumentQuizQuestion } from '../../../data/documentQuizzes'

type QuizQuestionProps = {
  quizId: string
  question: DocumentQuizQuestion
  index: number
  value: string | undefined
  onChange: (questionId: string, option: string) => void
  disabled?: boolean
  /** From backend grading only; cleared locally when the student changes this question. */
  hasIncorrectAnswer?: boolean
}

export function QuizQuestion({
  quizId,
  question,
  index,
  value,
  onChange,
  disabled,
  hasIncorrectAnswer = false,
}: QuizQuestionProps) {
  const groupName = `${quizId}-${question.id}`
  const legendId = `${groupName}-legend`

  return (
    <fieldset
      className={[
        'portal-doc-quiz-question',
        'portal-doc-quiz-question--bar-only',
        hasIncorrectAnswer ? 'portal-doc-quiz-question--incorrect' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      aria-labelledby={legendId}
      aria-invalid={hasIncorrectAnswer ? true : undefined}
    >
      <legend id={legendId} className="portal-doc-quiz-question__legend">
        <span className="portal-doc-quiz-question__num">{index + 1}.</span>{' '}
        <span className="portal-doc-quiz-question__prompt">{question.question}</span>
      </legend>
      <ul className="portal-doc-quiz-question__options" role="presentation">
        {question.options.map((opt, optIndex) => {
          const inputId = `${groupName}-opt-${optIndex}`
          const checked = value === opt
          return (
            <li key={opt} className="portal-doc-quiz-option-row">
              <input
                type="radio"
                className="portal-doc-quiz-option-row__input visually-hidden"
                id={inputId}
                name={groupName}
                value={opt}
                checked={checked}
                onChange={() => onChange(question.id, opt)}
              />
              <label
                className={[
                  'portal-doc-quiz-option-row__label',
                  checked ? 'portal-doc-quiz-option-row__label--selected' : '',
                  hasIncorrectAnswer && checked
                    ? 'portal-doc-quiz-option-row__label--incorrect-selected'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                htmlFor={inputId}
              >
                <span
                  className="portal-doc-quiz-option-row__mark"
                  aria-hidden="true"
                />
                <span className="portal-doc-quiz-option-row__text">{opt}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}
