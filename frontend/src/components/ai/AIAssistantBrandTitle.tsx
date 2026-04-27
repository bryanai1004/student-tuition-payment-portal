import { useStudentPortalT } from '@/LanguageContext'

type AIAssistantBrandTitleProps = {
  /** `panel` = dialog header; `minimized` = compact bar label */
  variant: 'panel' | 'minimized'
}

/**
 * Institutional title: Cinzel “AMU” (medium weight) + bold “AI Assist” in portal red.
 */
export function AIAssistantBrandTitle({ variant }: AIAssistantBrandTitleProps) {
  const t = useStudentPortalT()
  const base =
    variant === 'panel'
      ? 'portal-ai-assistant-brand-title portal-ai-assistant-brand-title--panel'
      : 'portal-ai-assistant-brand-title portal-ai-assistant-brand-title--minimized'

  if (variant === 'panel') {
    return <span className={base}>AMU AI Assist - 1.0</span>
  }

  return (
    <span className={base}>
      <span className="portal-ai-assistant-brand-title__mark">{t('amuAiAssistMark')}</span>
      <span className="portal-ai-assistant-brand-title__rest">{t('amuAiAssistRest')}</span>
    </span>
  )
}
