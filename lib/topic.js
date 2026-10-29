/** Current user topic extraction. No history is stored on disk. */
function textOf(value) {
  if (typeof value === 'string') return value.trim().slice(0, 400)
  if (!Array.isArray(value)) return ''
  return value.map((part) => {
    if (typeof part === 'string') return part
    if (typeof part?.text === 'string') return part.text
    return typeof part?.text?.value === 'string' ? part.text.value : ''
  }).filter(Boolean).join(' ').trim().slice(0, 400)
}

/** null means a non-user message; an empty string means a user message without text. */
export function userMessageText(message, assumeUser = false) {
  if (typeof message === 'string') return assumeUser ? textOf(message) : null
  if (!message || typeof message !== 'object') return null
  if (message.role !== 'user' && message.role !== 'human' && !(assumeUser && !message.role)) return null
  return textOf(message.text) || textOf(message.content)
}

function latestUserText(messages) {
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = userMessageText(messages[i])
    if (text !== null) return text
  }
  return ''
}

export function pickTopic(context) {
  const c = context || {}
  const conversation = c.conversation
  const candidates = [
    textOf(c.userText), textOf(c.topic), textOf(c.query),
    userMessageText(c.message, true),
    latestUserText(c.messages),
    latestUserText(Array.isArray(conversation) ? conversation : conversation?.messages),
    userMessageText(c.lastUserMessage, true),
    userMessageText(c.agent?.session?.lastUserMessage, true),
    userMessageText(c.agent?.lastUserMessage, true),
  ]
  return candidates.find((text) => typeof text === 'string' && text.length > 0) || ''
}
