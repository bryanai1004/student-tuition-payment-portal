import { useCallback, useRef, type Ref } from 'react'
import type { AIAssistantAttachment } from '../../hooks/useAIAssistant'

const IMAGE_ACCEPT = 'image/*'
const FILE_ACCEPT =
  '.pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'

type AIAssistantInputProps = {
  id: string
  value: string
  onChange: (next: string) => void
  onSubmit: () => void
  disabled?: boolean
  inputRef: Ref<HTMLTextAreaElement>
  attachments: AIAssistantAttachment[]
  onAddAttachments: (files: FileList | File[]) => void
  onRemoveAttachment: (id: string) => void
}

export function AIAssistantInput({
  id,
  value,
  onChange,
  onSubmit,
  disabled,
  inputRef,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
}: AIAssistantInputProps) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canSend = value.trim() !== '' || attachments.length > 0
  const sendDisabled = Boolean(disabled || !canSend)

  const onPickImage = useCallback(() => {
    imageInputRef.current?.click()
  }, [])

  const onPickFile = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  return (
    <div className="portal-ai-assistant-input-stack">
      {attachments.length > 0 ? (
        <div className="portal-ai-assistant-attachments" aria-label="Selected attachments">
          <ul className="portal-ai-assistant-attachments__list">
            {attachments.map((a) => (
              <li key={a.id} className="portal-ai-assistant-attachments__item">
                {a.previewUrl ? (
                  <img
                    className="portal-ai-assistant-attachments__thumb"
                    src={a.previewUrl}
                    alt=""
                  />
                ) : (
                  <span className="portal-ai-assistant-attachments__doc" aria-hidden>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                      <path
                        d="M8 3h6l5 5v11a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2z"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                      />
                      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </span>
                )}
                <span className="portal-ai-assistant-attachments__name" title={a.name}>
                  {a.name}
                </span>
                <button
                  type="button"
                  className="portal-ai-assistant-attachments__remove"
                  onClick={() => onRemoveAttachment(a.id)}
                  aria-label={`Remove ${a.name}`}
                  disabled={disabled}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <input
        ref={imageInputRef}
        type="file"
        className="visually-hidden"
        tabIndex={-1}
        accept={IMAGE_ACCEPT}
        multiple
        onChange={(e) => {
          const f = e.target.files
          if (f?.length) onAddAttachments(f)
          e.target.value = ''
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="visually-hidden"
        tabIndex={-1}
        accept={FILE_ACCEPT}
        multiple
        onChange={(e) => {
          const f = e.target.files
          if (f?.length) onAddAttachments(f)
          e.target.value = ''
        }}
      />

      <div className="portal-ai-assistant-compose">
        <div className="portal-ai-assistant-compose__leading" role="group" aria-label="Add attachments">
          <button
            type="button"
            className="portal-ai-assistant-upload-btn"
            onClick={onPickImage}
            disabled={disabled}
            aria-label="Add images"
            title="Add images"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
              <rect
                x="3"
                y="5"
                width="18"
                height="14"
                rx="2.5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <circle cx="8.5" cy="10" r="1.6" fill="currentColor" />
              <path
                d="M21 15l-5-5-4 4-2-2-5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="portal-ai-assistant-upload-btn"
            onClick={onPickFile}
            disabled={disabled}
            aria-label="Add files"
            title="Add files (PDF, Word, text)"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
              <path
                d="M8 3h6l5 5v11a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        </div>
        <label htmlFor={id} className="visually-hidden">
          Message to AMU AI Assistant
        </label>
        <textarea
          ref={inputRef}
          id={id}
          className="portal-ai-assistant-input"
          rows={2}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey) return
            if (sendDisabled) return
            e.preventDefault()
            onSubmit()
          }}
          placeholder="Ask a question…"
          autoComplete="off"
        />
        <button
          type="button"
          className="portal-ai-assistant-send"
          onClick={onSubmit}
          disabled={sendDisabled}
          aria-label="Send message"
        >
          Send
        </button>
      </div>
    </div>
  )
}
