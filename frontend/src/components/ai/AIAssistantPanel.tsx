import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, Ref } from 'react'
import { useStudentPortalT } from '../../LanguageContext'
import type { AIAssistantChatMessage } from '../../hooks/useAIAssistant'
import { AIAssistantBrandTitle } from './AIAssistantBrandTitle'
import { AIAssistantInput } from './AIAssistantInput'
import { AIAssistantWelcomeMessage } from './AIAssistantWelcomeMessage'

const WELCOME_LOTTIE_PX = 80

type AIAssistantPanelProps = {
  inputId: string
  messagesRegionId: string
  messages: AIAssistantChatMessage[]
  isAwaitingReply: boolean
  draft: string
  setDraft: (next: string) => void
  onSend: () => void
  inputRef: Ref<HTMLTextAreaElement>
  onClose: () => void
  onMinimize: () => void
  onClear: () => void
  /** Desktop: drag by header (minimize/close excluded in handler). */
  onHeaderPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void
  desktopDraggableHeader?: boolean
  catHidden?: boolean
  onShowCat?: () => void
}

export function AIAssistantPanel({
  inputId,
  messagesRegionId,
  messages,
  isAwaitingReply,
  draft,
  setDraft,
  onSend,
  inputRef,
  onClose,
  onMinimize,
  onClear,
  onHeaderPointerDown,
  desktopDraggableHeader,
  catHidden = false,
  onShowCat,
}: AIAssistantPanelProps) {
  const t = useStudentPortalT()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, isAwaitingReply])

  return (
    <section
      className="portal-ai-assistant-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="portal-ai-assistant-title"
    >
      <header
        className={
          desktopDraggableHeader
            ? 'portal-ai-assistant-panel__header portal-ai-assistant-panel__header--draggable'
            : 'portal-ai-assistant-panel__header'
        }
        onPointerDown={onHeaderPointerDown}
      >
        <div className="portal-ai-assistant-panel__titles">
          <h2 id="portal-ai-assistant-title" className="portal-ai-assistant-panel__title">
            <AIAssistantBrandTitle variant="panel" />
          </h2>
        </div>
        <div className="portal-ai-assistant-panel__header-actions">
          <button type="button" className="portal-ai-assistant-panel__header-text-btn" onClick={onClear}>
            {t('clearChat')}
          </button>
          <button
            type="button"
            className="portal-ai-assistant-icon-btn"
            onClick={onMinimize}
            aria-label={t('minimizeChatPanel')}
          >
            <span aria-hidden="true">─</span>
          </button>
          <button
            type="button"
            className="portal-ai-assistant-icon-btn"
            onClick={onClose}
            aria-label={t('closeChatPanel')}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      {catHidden && onShowCat ? (
        <div className="portal-ai-assistant-panel__toolbar">
          <div className="portal-ai-assistant-panel__toolbar-actions">
            <button type="button" className="portal-ai-assistant-link-btn" onClick={onShowCat}>
              {t('showAmuAiCat')}
            </button>
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        id={messagesRegionId}
        className="portal-ai-assistant-messages"
        role="log"
        aria-relevant="additions"
        aria-live="polite"
      >
        <ul className="portal-ai-assistant-msg-list">
          {messages.map((m) => (
            <li
              key={m.id}
              className={
                m.role === 'user'
                  ? 'portal-ai-assistant-msg portal-ai-assistant-msg--user'
                  : 'portal-ai-assistant-msg portal-ai-assistant-msg--assistant'
              }
            >
              <span className="visually-hidden">
                {m.role === 'user' ? t('messageRoleYou') : t('messageRoleAssistant')}:{' '}
              </span>
              <div
                className={
                  m.welcomeLines?.length
                    ? 'portal-ai-assistant-bubble portal-ai-assistant-bubble--welcome'
                    : 'portal-ai-assistant-bubble'
                }
              >
                {m.welcomeLines?.length ? (
                  <AIAssistantWelcomeMessage lines={m.welcomeLines} lottieSize={WELCOME_LOTTIE_PX} />
                ) : (
                  m.content
                )}
              </div>
            </li>
          ))}
          {isAwaitingReply ? (
            <li className="portal-ai-assistant-msg portal-ai-assistant-msg--assistant">
              <span className="visually-hidden">{t('assistantTyping')}</span>
              <div className="portal-ai-assistant-bubble portal-ai-assistant-bubble--typing" aria-busy="true">
                <span className="portal-ai-assistant-typing">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            </li>
          ) : null}
        </ul>
      </div>

      <AIAssistantInput
        id={inputId}
        value={draft}
        onChange={setDraft}
        onSubmit={onSend}
        disabled={isAwaitingReply}
        inputRef={inputRef}
      />
    </section>
  )
}
