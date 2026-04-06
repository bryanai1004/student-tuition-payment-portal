import { useId } from 'react'
import type { AIAssistantPageContext } from '../../data/aiMockReplies'
import { useAIAssistant } from '../../hooks/useAIAssistant'
import { AIAssistantPanel } from './AIAssistantPanel'
import { useAIAssistantPanelLayout } from './useAIAssistantPanelLayout'
import './aiAssistant.css'

type AIAssistantLauncherProps = {
  pageContext: AIAssistantPageContext
}

export function AIAssistantLauncher({ pageContext }: AIAssistantLauncherProps) {
  const baseId = useId()
  const inputId = `${baseId}-input`
  const messagesRegionId = `${baseId}-messages`

  const {
    panelState,
    messages,
    draft,
    setDraft,
    isAwaitingReply,
    inputRef,
    openPanel,
    minimizePanel,
    expandPanel,
    closePanel,
    clearChat,
    submitDraft,
  } = useAIAssistant(pageContext)

  const layout = useAIAssistantPanelLayout()

  return (
    <div className="portal-ai-assistant-root">
      {panelState === 'closed' ? (
        <button
          type="button"
          className="portal-ai-assistant-launcher"
          onClick={openPanel}
          aria-label="Open AMU AI Assistant chat"
          aria-haspopup="dialog"
        >
          <span className="portal-ai-assistant-launcher__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true">
              <path
                d="M12 3C7.03 3 3 6.58 3 11c0 2.13 1.04 4.06 2.72 5.35L4.5 20.5l4.45-1.18A8.94 8.94 0 0012 19c4.97 0 9-3.58 9-8s-4.03-8-9-8z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M8.5 11h.01M12 11h.01M15.5 11h.01"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </button>
      ) : null}

      {panelState === 'minimized' ? (
        layout.isMobile ? (
          <div className="portal-ai-assistant-minimized">
            <button
              type="button"
              className="portal-ai-assistant-minimized__expand"
              onClick={expandPanel}
              aria-label="Expand AMU AI Assistant chat"
            >
              <span className="portal-ai-assistant-minimized__title">AMU AI Assistant</span>
              <span className="portal-ai-assistant-minimized__hint">Tap to expand</span>
            </button>
            <button
              type="button"
              className="portal-ai-assistant-icon-btn portal-ai-assistant-minimized__close"
              onClick={closePanel}
              aria-label="Close chat panel"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ) : (
          <div
            className="portal-ai-assistant-minimized-float"
            style={layout.desktopMinimizedWrapStyle}
          >
            <div className="portal-ai-assistant-minimized portal-ai-assistant-minimized--anchored">
              <button
                type="button"
                className="portal-ai-assistant-minimized__expand"
                onClick={expandPanel}
                aria-label="Expand AMU AI Assistant chat"
              >
                <span className="portal-ai-assistant-minimized__title">AMU AI Assistant</span>
                <span className="portal-ai-assistant-minimized__hint">Tap to expand</span>
              </button>
              <button
                type="button"
                className="portal-ai-assistant-icon-btn portal-ai-assistant-minimized__close"
                onClick={closePanel}
                aria-label="Close chat panel"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>
        )
      ) : null}

      {panelState === 'open' ? (
        layout.isMobile ? (
          <div className="portal-ai-assistant-panel-wrap portal-ai-assistant-panel-wrap--sheet">
            <AIAssistantPanel
              inputId={inputId}
              messagesRegionId={messagesRegionId}
              messages={messages}
              isAwaitingReply={isAwaitingReply}
              draft={draft}
              setDraft={setDraft}
              onSend={() => void submitDraft()}
              inputRef={inputRef}
              onClose={closePanel}
              onMinimize={minimizePanel}
              onClear={clearChat}
            />
          </div>
        ) : (
          <div
            className="portal-ai-assistant-panel-wrap portal-ai-assistant-panel-wrap--desktop"
            style={layout.desktopOpenWrapStyle}
          >
            <AIAssistantPanel
              inputId={inputId}
              messagesRegionId={messagesRegionId}
              messages={messages}
              isAwaitingReply={isAwaitingReply}
              draft={draft}
              setDraft={setDraft}
              onSend={() => void submitDraft()}
              inputRef={inputRef}
              onClose={closePanel}
              onMinimize={minimizePanel}
              onClear={clearChat}
              onHeaderPointerDown={layout.onHeaderPointerDown}
              desktopDraggableHeader
            />
            <div
              className="portal-ai-assistant-resize portal-ai-assistant-resize--e"
              onPointerDown={layout.onResizePointerDownEdge}
              aria-hidden="true"
            />
            <div
              className="portal-ai-assistant-resize portal-ai-assistant-resize--s"
              onPointerDown={layout.onResizePointerDownSouth}
              aria-hidden="true"
            />
            <div
              className="portal-ai-assistant-resize portal-ai-assistant-resize--se"
              onPointerDown={layout.onResizePointerDownCorner}
              aria-hidden="true"
            />
          </div>
        )
      ) : null}
    </div>
  )
}
