/** Viewport padding from edges when placing / clamping (matches ~1rem root inset). */
export const AI_ASSISTANT_VIEW_PADDING = 16

/** Minimum pixels of the panel that must remain visible inside the viewport. */
export const AI_ASSISTANT_MIN_VISIBLE = 64

export const AI_ASSISTANT_DEFAULT_WIDTH = 360
export const AI_ASSISTANT_DEFAULT_HEIGHT = 520

export const AI_ASSISTANT_MIN_WIDTH = 320
export const AI_ASSISTANT_MIN_HEIGHT = 420

/** Legacy bundled geometry JSON (migrated to split keys on read). */
export const AI_ASSISTANT_STORAGE_KEY = 'portal-ai-assistant-geometry-v1'

export const AMU_AI_PANEL_X = 'amu-ai-panel-x'
export const AMU_AI_PANEL_Y = 'amu-ai-panel-y'
export const AMU_AI_PANEL_WIDTH = 'amu-ai-panel-width'
export const AMU_AI_PANEL_HEIGHT = 'amu-ai-panel-height'

/** Match `aiAssistant.css` mobile tweak breakpoint. */
export const AI_ASSISTANT_MOBILE_MEDIA = '(max-width: 480px)'

export type AIAssistantStoredGeometry = {
  width: number
  height: number
  x: number
  y: number
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function num(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return v
}

export function maxWidthForViewport(viewportWidth: number): number {
  return Math.min(720, Math.max(AI_ASSISTANT_MIN_WIDTH, viewportWidth - 24))
}

export function maxHeightForViewport(viewportHeight: number): number {
  return Math.max(AI_ASSISTANT_MIN_HEIGHT, viewportHeight - 24)
}

export function clampSize(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): Pick<AIAssistantStoredGeometry, 'width' | 'height'> {
  const maxW = maxWidthForViewport(viewportWidth)
  const maxH = maxHeightForViewport(viewportHeight)
  return {
    width: Math.min(maxW, Math.max(AI_ASSISTANT_MIN_WIDTH, width)),
    height: Math.min(maxH, Math.max(AI_ASSISTANT_MIN_HEIGHT, height)),
  }
}

export function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): Pick<AIAssistantStoredGeometry, 'x' | 'y'> {
  const minX = -(width - AI_ASSISTANT_MIN_VISIBLE)
  const maxX = viewportWidth - AI_ASSISTANT_MIN_VISIBLE
  const minY = -(height - AI_ASSISTANT_MIN_VISIBLE)
  const maxY = viewportHeight - AI_ASSISTANT_MIN_VISIBLE
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  }
}

export function clampGeometry(
  g: AIAssistantStoredGeometry,
  viewportWidth: number,
  viewportHeight: number,
): AIAssistantStoredGeometry {
  const { width, height } = clampSize(g.width, g.height, viewportWidth, viewportHeight)
  const { x, y } = clampPosition(g.x, g.y, width, height, viewportWidth, viewportHeight)
  return { width, height, x, y }
}

export function defaultGeometry(
  viewportWidth: number,
  viewportHeight: number,
): AIAssistantStoredGeometry {
  const { width, height } = clampSize(
    AI_ASSISTANT_DEFAULT_WIDTH,
    AI_ASSISTANT_DEFAULT_HEIGHT,
    viewportWidth,
    viewportHeight,
  )
  const x = viewportWidth - width - AI_ASSISTANT_VIEW_PADDING
  const y = viewportHeight - height - AI_ASSISTANT_VIEW_PADDING
  return clampGeometry({ width, height, x, y }, viewportWidth, viewportHeight)
}

export function parseStoredGeometry(raw: string | null): AIAssistantStoredGeometry | null {
  if (raw == null || raw === '') return null
  try {
    const v: unknown = JSON.parse(raw)
    if (!isRecord(v)) return null
    const width = num(v.width)
    const height = num(v.height)
    const x = num(v.x)
    const y = num(v.y)
    if (width == null || height == null || x == null || y == null) return null
    return { width, height, x, y }
  } catch {
    return null
  }
}

function readSplitPanelGeometry(): AIAssistantStoredGeometry | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const w = Number(localStorage.getItem(AMU_AI_PANEL_WIDTH))
    const h = Number(localStorage.getItem(AMU_AI_PANEL_HEIGHT))
    const x = Number(localStorage.getItem(AMU_AI_PANEL_X))
    const y = Number(localStorage.getItem(AMU_AI_PANEL_Y))
    if (![w, h, x, y].every((n) => Number.isFinite(n))) return null
    return { width: w, height: h, x, y }
  } catch {
    return null
  }
}

export function readStoredGeometryClamped(
  viewportWidth: number,
  viewportHeight: number,
): AIAssistantStoredGeometry {
  const split = readSplitPanelGeometry()
  if (split) return clampGeometry(split, viewportWidth, viewportHeight)
  const legacy = parseStoredGeometry(
    typeof localStorage !== 'undefined' ? localStorage.getItem(AI_ASSISTANT_STORAGE_KEY) : null,
  )
  if (!legacy) return defaultGeometry(viewportWidth, viewportHeight)
  const clamped = clampGeometry(legacy, viewportWidth, viewportHeight)
  persistGeometry(clamped)
  return clamped
}

export function persistGeometry(g: AIAssistantStoredGeometry): void {
  try {
    localStorage.setItem(AMU_AI_PANEL_X, String(Math.round(g.x)))
    localStorage.setItem(AMU_AI_PANEL_Y, String(Math.round(g.y)))
    localStorage.setItem(AMU_AI_PANEL_WIDTH, String(Math.round(g.width)))
    localStorage.setItem(AMU_AI_PANEL_HEIGHT, String(Math.round(g.height)))
    localStorage.removeItem(AI_ASSISTANT_STORAGE_KEY)
  } catch {
    /* ignore quota / private mode */
  }
}
