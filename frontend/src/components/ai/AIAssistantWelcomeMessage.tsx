import Lottie from 'lottie-react'
import { useCatLottieData } from './useCatLottieData'

type AIAssistantWelcomeMessageProps = {
  lines: readonly string[]
  lottieSize?: number
}

export function AIAssistantWelcomeMessage({ lines, lottieSize = 80 }: AIAssistantWelcomeMessageProps) {
  const data = useCatLottieData()
  const [title, ...rest] = lines

  return (
    <div className="portal-ai-assistant-welcome">
      <div
        className="portal-ai-assistant-welcome__lottie"
        style={{ width: lottieSize, height: lottieSize }}
        aria-hidden
      >
        {data ? (
          <Lottie animationData={data} loop style={{ width: lottieSize, height: lottieSize }} />
        ) : (
          <div
            className="portal-ai-assistant-welcome__lottie-placeholder"
            style={{ width: lottieSize, height: lottieSize }}
            aria-hidden
          />
        )}
      </div>
      <div className="portal-ai-assistant-welcome__text">
        {title ? <p className="portal-ai-assistant-welcome__title">{title}</p> : null}
        {rest.map((line, i) => (
          <p key={i} className="portal-ai-assistant-welcome__p">
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}
