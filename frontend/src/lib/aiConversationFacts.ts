export type AIAssistantConversationFactLanguage = 'en' | 'zh'

export type AIAssistantConversationFactsPayload = {
  statedName?: string
  preferredLanguage?: AIAssistantConversationFactLanguage
}

type ConversationFactMessageLike = {
  role: 'user' | 'assistant'
  content: string
}

const MAX_NAME_LENGTH = 80

function cleanName(value: string): string | null {
  const trimmed = value.trim().replace(/[\s\t]+/g, ' ').replace(/[，。！？,.!?]+$/u, '')
  if (trimmed === '' || trimmed.length > MAX_NAME_LENGTH) return null
  return trimmed
}

function extractName(text: string): string | null {
  const patterns = [
    /(?:^|[\s，。,.!?！？])我叫\s*([A-Za-z][A-Za-z .'-]{0,60}|[\u4E00-\u9FFF·]{1,20})/u,
    /(?:^|[\s，。,.!?！？])我的名字是\s*([A-Za-z][A-Za-z .'-]{0,60}|[\u4E00-\u9FFF·]{1,20})/u,
    /\bmy name is\s+([A-Za-z][A-Za-z .'-]{0,60})\b/i,
    /\bi am called\s+([A-Za-z][A-Za-z .'-]{0,60})\b/i,
    /\byou can call me\s+([A-Za-z][A-Za-z .'-]{0,60})\b/i,
    /\bcall me\s+([A-Za-z][A-Za-z .'-]{0,60})\b/i,
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(text)
    const candidate = match?.[1]
    if (!candidate) continue
    const cleaned = cleanName(candidate)
    if (cleaned) return cleaned
  }

  return null
}

function extractPreferredLanguage(text: string): AIAssistantConversationFactLanguage | null {
  if (
    /请用中文|用中文回答|中文回答|说中文|讲中文|可以中文|请说中文|请讲中文|回复中文/u.test(text) ||
    /\b(answer|respond|reply|speak)\s+in\s+(chinese|mandarin)\b/i.test(text) ||
    /\b(use\s+chinese)\b/i.test(text)
  ) {
    return 'zh'
  }

  if (
    /请用英文|用英文回答|英文回答|说英文|讲英文|回复英文/u.test(text) ||
    /\b(answer|respond|reply|speak)\s+in\s+english\b/i.test(text) ||
    /\buse\s+english\b/i.test(text)
  ) {
    return 'en'
  }

  return null
}

export function extractConversationFacts(
  messages: ConversationFactMessageLike[],
): AIAssistantConversationFactsPayload | undefined {
  let statedName: string | undefined
  let preferredLanguage: AIAssistantConversationFactLanguage | undefined

  for (const message of messages) {
    if (message.role !== 'user') continue
    const text = message.content.trim()
    if (text === '') continue

    const extractedName = extractName(text)
    if (extractedName) statedName = extractedName

    const extractedLanguage = extractPreferredLanguage(text)
    if (extractedLanguage) preferredLanguage = extractedLanguage
  }

  if (!statedName && !preferredLanguage) return undefined
  return {
    ...(statedName ? { statedName } : {}),
    ...(preferredLanguage ? { preferredLanguage } : {}),
  }
}
