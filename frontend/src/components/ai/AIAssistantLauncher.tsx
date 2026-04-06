import { useId, useRef } from 'react'
import { AIAssistantBrandTitle } from './AIAssistantBrandTitle'
import { AIAssistantPanel } from './AIAssistantPanel'
import { AIAssistantDockCat } from './AIAssistantPet'
import { useAIAssistantMobileAnchor } from './AIAssistantMobileAnchorContext'
import { useAIAssistantContext } from './AIAssistantProvider'
import { useAIAssistantCatDragEnabled, useAIAssistantDockPosition } from './useAIAssistantDockPosition'
import { useAIAssistantPanelLayout } from './useAIAssistantPanelLayout'
import {
  useAIAssistantCatContextMenuEnabled,
  useAIAssistantCatDisplaySize,
  useAIAssistantPet,
} from './useAIAssistantPet'
import './aiAssistant.css'

export function AIAssistantLauncher() {
  const baseId = useId()
  const inputId = `${baseId}-input`
  const messagesRegionId = `${baseId}-messages`
  const dockRef = useRef<HTMLDivElement>(null)
  const { mobileDockAnchorEl } = useAIAssistantMobileAnchor()

  const dragEnabled = useAIAssistantCatDragEnabled()
  const contextMenuEnabled = useAIAssistantCatContextMenuEnabled()
  const catSize = useAIAssistantCatDisplaySize()
  const { catHidden, hideCat, showCat } = useAIAssistantPet()

  const {
    panelState,
    messages,
    draft,
    setDraft,
    attachments,
    addAttachments,
    removeAttachment,
    isAwaitingReply,
    inputRef,
    openPanel,
    minimizePanel,
    expandPanel,
    closePanel,
    clearChat,
    submitDraft,
  } = useAIAssistantContext()

  const layout = useAIAssistantPanelLayout()

  const mobileAnchorForDock = layout.isMobile ? mobileDockAnchorEl : null

  const {
    dockStyle,
    onDockPointerDown,
    onDockPointerMove,
    onDockPointerUp,
    onDockPointerCancel,
  } = useAIAssistantDockPosition(dockRef, dragEnabled, openPanel, {
    isMobile: layout.isMobile,
    mobileAnchorEl: mobileAnchorForDock,
  })

  const dockClassNames = [
    'portal-ai-assistant-dock',
    dragEnabled && 'portal-ai-assistant-dock--draggable',
    catHidden && 'portal-ai-assistant-dock--cat-hidden',
    layout.isMobile && 'portal-ai-assistant-dock--compact',
    layout.isMobile && !dockStyle && 'portal-ai-assistant-dock--mobile-fallback',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="portal-ai-assistant-root">
      {panelState === 'closed' ? (
        <div ref={dockRef} className={dockClassNames} style={dockStyle}>
          {!catHidden ? (
            <AIAssistantDockCat
              size={catSize}
              dragEnabled={dragEnabled}
              contextMenuEnabled={contextMenuEnabled}
              onCatPointerDown={onDockPointerDown}
              onCatPointerMove={onDockPointerMove}
              onCatPointerUp={onDockPointerUp}
              onCatPointerCancel={onDockPointerCancel}
              onOpenAssistant={openPanel}
              onRequestHideCat={hideCat}
            />
          ) : null}
          <button
            type="button"
            className="portal-ai-assistant-launcher"
            onClick={dragEnabled ? undefined : openPanel}
            onPointerDown={dragEnabled ? onDockPointerDown : undefined}
            onPointerMove={dragEnabled ? onDockPointerMove : undefined}
            onPointerUp={dragEnabled ? onDockPointerUp : undefined}
            onPointerCancel={dragEnabled ? onDockPointerCancel : undefined}
            aria-label="Open AMU AI Assist"
            aria-haspopup="dialog"
          >
            <span className="portal-ai-assistant-launcher__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
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
        </div>
      ) : null}

      {panelState === 'minimized' ? (
        layout.isMobile ? (
          <div className="portal-ai-assistant-minimized">
            <button
              type="button"
              className="portal-ai-assistant-minimized__expand"
              onClick={expandPanel}
              aria-label="Expand AMU AI Assist"
            >
              <span className="portal-ai-assistant-minimized__title">
                <AIAssistantBrandTitle variant="minimized" />
              </span>
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
                aria-label="Expand AMU AI Assist"
              >
                <span className="portal-ai-assistant-minimized__title">
                  <AIAssistantBrandTitle variant="minimized" />
                </span>
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
              attachments={attachments}
              onAddAttachments={addAttachments}
              onRemoveAttachment={removeAttachment}
              onSend={() => void submitDraft()}
              inputRef={inputRef}
              onClose={closePanel}
              onMinimize={minimizePanel}
              onClear={clearChat}
              catHidden={catHidden}
              onShowCat={showCat}
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
              attachments={attachments}
              onAddAttachments={addAttachments}
              onRemoveAttachment={removeAttachment}
              onSend={() => void submitDraft()}
              inputRef={inputRef}
              onClose={closePanel}
              onMinimize={minimizePanel}
              onClear={clearChat}
              onHeaderPointerDown={layout.onHeaderPointerDown}
              desktopDraggableHeader
              catHidden={catHidden}
              onShowCat={showCat}
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
