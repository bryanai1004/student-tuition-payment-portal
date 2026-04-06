import type { AIAssistantPageContext } from '../data/aiMockReplies'
import { generateMockAssistantReply } from '../data/aiMockReplies'

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => resolve(), ms)
    if (!signal) return
    if (signal.aborted) {
      window.clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

export type SendAssistantMessageOptions = {
  /** Pass through for future backend calls; honored in mock mode for cancellation. */
  signal?: AbortSignal
}

/** In-memory attachment for UI + future multipart / OpenAI file flows. */
export type SendAssistantAttachmentPayload = {
  id: string
  name: string
  type: 'image' | 'file'
  mimeType: string
  size: number
  file: File
  /** Object URL for image previews; revoke when removing or after send. */
  previewUrl?: string
}

export type SendAssistantMessagePayload = {
  text: string
  attachments: SendAssistantAttachmentPayload[]
  pageContext: AIAssistantPageContext
}

/**
 * Transport layer for assistant replies. Today this simulates latency and returns mock text.
 * Later: POST to your secure company proxy that calls OpenAI server-side (with auth, logging, and moderation).
 */
export async function sendAssistantMessage(
  payload: SendAssistantMessagePayload,
  options?: SendAssistantMessageOptions,
): Promise<string> {
  const { text, attachments, pageContext } = payload
  const ms = 520 + Math.floor(Math.random() * 700)
  await sleep(ms, options?.signal)
  void attachments
  return generateMockAssistantReply(text, pageContext)
}
