import type { AnthropicMessagesRequest, AnthropicContentBlock } from './types';

export function estimateAnthropicTokens(req: AnthropicMessagesRequest): number {
  let totalChars = 0;
  let messageCount = 0;

  // 1. System
  if (req.system) {
    if (typeof req.system === 'string') {
      totalChars += req.system.length;
    } else if (Array.isArray(req.system)) {
      for (const block of req.system) {
        totalChars += block.text?.length || 0;
      }
    }
    totalChars += 10;
  }

  // 2. Messages
  if (req.messages && Array.isArray(req.messages)) {
    messageCount = req.messages.length;
    for (const msg of req.messages) {
      if (typeof msg.content === 'string') {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content as AnthropicContentBlock[]) {
          if (block.type === 'text') {
            totalChars += block.text.length;
          } else if (block.type === 'tool_use') {
            totalChars += block.name.length;
            totalChars += JSON.stringify(block.input || {}).length;
          } else if (block.type === 'tool_result') {
            if (typeof block.content === 'string') {
              totalChars += block.content.length;
            } else if (Array.isArray(block.content)) {
              for (const c of block.content) {
                if (c.type === 'text') totalChars += c.text.length;
              }
            }
          } else if (block.type === 'thinking') {
            totalChars += block.thinking.length;
          }
        }
      }
    }
  }

  // 3. Tools
  let toolTokens = 0;
  if (req.tools && Array.isArray(req.tools)) {
    for (const tool of req.tools) {
      const toolStr = JSON.stringify(tool);
      toolTokens += Math.ceil(toolStr.length / 3.6) + 15;
    }
  }

  // Base estimation: ~3.75 chars per token + message envelope overhead
  const textTokens = Math.ceil(totalChars / 3.75);
  const envelopeTokens = messageCount * 4;

  return Math.max(1, textTokens + envelopeTokens + toolTokens);
}
