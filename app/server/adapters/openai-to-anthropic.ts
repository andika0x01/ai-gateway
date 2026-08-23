import type {
  AnthropicMessageResponse,
  AnthropicContentBlock,
  AnthropicToolUseBlock,
  AnthropicThinkingBlock,
  AnthropicTextBlock,
  OpenAIChatResponse,
  OpenAIChunk,
} from './types';
import crypto from 'node:crypto';

// Non-streaming response converter
export function convertOpenAIToAnthropicResponse(
  openAIRes: OpenAIChatResponse,
  requestedModel: string
): AnthropicMessageResponse {
  const choice = openAIRes.choices[0];
  const message = choice?.message;
  const contentBlocks: AnthropicContentBlock[] = [];

  if (message?.reasoning_content) {
    contentBlocks.push({
      type: 'thinking',
      thinking: message.reasoning_content,
    } as AnthropicThinkingBlock);
  }

  if (message?.content) {
    // Check if content has embedded <think>...</think>
    const thinkMatch = message.content.match(/^<think>([\s\S]*?)<\/think>([\s\S]*)$/);
    if (thinkMatch) {
      if (thinkMatch[1].trim()) {
        contentBlocks.push({
          type: 'thinking',
          thinking: thinkMatch[1].trim(),
        } as AnthropicThinkingBlock);
      }
      if (thinkMatch[2].trim()) {
        contentBlocks.push({
          type: 'text',
          text: thinkMatch[2].trim(),
        } as AnthropicTextBlock);
      }
    } else {
      contentBlocks.push({
        type: 'text',
        text: message.content,
      } as AnthropicTextBlock);
    }
  }

  if (message?.tool_calls && message.tool_calls.length > 0) {
    for (const tc of message.tool_calls) {
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = JSON.parse(tc.function.arguments || '{}');
      } catch {
        parsedInput = { raw_arguments: tc.function.arguments };
      }

      contentBlocks.push({
        type: 'tool_use',
        id: tc.id || `toolu_${crypto.randomUUID().slice(0, 12)}`,
        name: tc.function.name,
        input: parsedInput,
      } as AnthropicToolUseBlock);
    }
  }

  let stopReason: 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' = 'end_turn';
  if (choice?.finish_reason === 'tool_calls') {
    stopReason = 'tool_use';
  } else if (choice?.finish_reason === 'length') {
    stopReason = 'max_tokens';
  }

  return {
    id: `msg_${crypto.randomUUID().slice(0, 16)}`,
    type: 'message',
    role: 'assistant',
    content: contentBlocks,
    model: requestedModel,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: openAIRes.usage?.prompt_tokens || 0,
      output_tokens: openAIRes.usage?.completion_tokens || 0,
    },
  };
}

// SSE Formatter helper
export function formatSSEEvent(eventType: string, data: Record<string, unknown>): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Streaming SSE Transformer class
export class OpenAISSEStreamTransformer {
  private messageId: string;
  private requestedModel: string;
  private hasEmittedMessageStart = false;
  private currentBlockIndex = -1;
  private activeBlockType: 'none' | 'thinking' | 'text' | 'tool_use' = 'none';
  private activeToolCallIndex: number | null = null;
  private currentToolCallId = '';
  private currentToolCallName = '';
  private insideThinkTag = false;
  private inputTokens = 0;
  private outputTokens = 0;
  private finishReason: string | null = null;

  constructor(requestedModel: string, estimatedInputTokens = 0) {
    this.messageId = `msg_${crypto.randomUUID().slice(0, 16)}`;
    this.requestedModel = requestedModel;
    this.inputTokens = estimatedInputTokens;
  }

  public *processChunk(chunk: OpenAIChunk): Generator<string, void, unknown> {
    const choice = chunk.choices?.[0];
    const delta = choice?.delta;

    // Capture usage if provided in final chunk
    if (chunk.usage) {
      if (chunk.usage.prompt_tokens) this.inputTokens = chunk.usage.prompt_tokens;
      if (chunk.usage.completion_tokens) this.outputTokens = chunk.usage.completion_tokens;
    }

    if (choice?.finish_reason) {
      this.finishReason = choice.finish_reason;
    }

    // 1. Emit message_start once
    if (!this.hasEmittedMessageStart) {
      this.hasEmittedMessageStart = true;
      yield formatSSEEvent('message_start', {
        type: 'message_start',
        message: {
          id: this.messageId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: this.requestedModel,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: this.inputTokens,
            output_tokens: 1,
          },
        },
      });
    }

    if (!delta) {
      return;
    }

    // 2. Handle Reasoning Content (from DeepSeek-R1 / NIM)
    const reasoningText = delta.reasoning_content || delta.reasoning;
    if (reasoningText) {
      if (this.activeBlockType !== 'thinking') {
        if (this.activeBlockType !== 'none') {
          yield formatSSEEvent('content_block_stop', {
            type: 'content_block_stop',
            index: this.currentBlockIndex,
          });
        }
        this.currentBlockIndex++;
        this.activeBlockType = 'thinking';
        yield formatSSEEvent('content_block_start', {
          type: 'content_block_start',
          index: this.currentBlockIndex,
          content_block: {
            type: 'thinking',
            thinking: '',
          },
        });
      }

      this.outputTokens++;
      yield formatSSEEvent('content_block_delta', {
        type: 'content_block_delta',
        index: this.currentBlockIndex,
        delta: {
          type: 'thinking_delta',
          thinking: reasoningText,
        },
      });
      return;
    }

    // 3. Handle Regular Content
    if (delta.content !== undefined && delta.content !== null && delta.content !== '') {
      let contentText = delta.content;

      // Handle <think> tags if embedded in text
      if (contentText.includes('<think>')) {
        this.insideThinkTag = true;
        contentText = contentText.replace('<think>', '');
      }

      if (this.insideThinkTag) {
        if (contentText.includes('</think>')) {
          const parts = contentText.split('</think>');
          const thinkPart = parts[0];
          const textPart = parts.slice(1).join('</think>');

          if (thinkPart) {
            if (this.activeBlockType !== 'thinking') {
              if (this.activeBlockType !== 'none') {
                yield formatSSEEvent('content_block_stop', {
                  type: 'content_block_stop',
                  index: this.currentBlockIndex,
                });
              }
              this.currentBlockIndex++;
              this.activeBlockType = 'thinking';
              yield formatSSEEvent('content_block_start', {
                type: 'content_block_start',
                index: this.currentBlockIndex,
                content_block: { type: 'thinking', thinking: '' },
              });
            }
            yield formatSSEEvent('content_block_delta', {
              type: 'content_block_delta',
              index: this.currentBlockIndex,
              delta: { type: 'thinking_delta', thinking: thinkPart },
            });
          }

          // Close thinking block
          if (this.activeBlockType === 'thinking') {
            yield formatSSEEvent('content_block_stop', {
              type: 'content_block_stop',
              index: this.currentBlockIndex,
            });
            this.activeBlockType = 'none';
          }
          this.insideThinkTag = false;

          if (textPart) {
            this.currentBlockIndex++;
            this.activeBlockType = 'text';
            yield formatSSEEvent('content_block_start', {
              type: 'content_block_start',
              index: this.currentBlockIndex,
              content_block: { type: 'text', text: '' },
            });
            yield formatSSEEvent('content_block_delta', {
              type: 'content_block_delta',
              index: this.currentBlockIndex,
              delta: { type: 'text_delta', text: textPart },
            });
          }
          return;
        } else {
          // Still inside think tag
          if (this.activeBlockType !== 'thinking') {
            if (this.activeBlockType !== 'none') {
              yield formatSSEEvent('content_block_stop', {
                type: 'content_block_stop',
                index: this.currentBlockIndex,
              });
            }
            this.currentBlockIndex++;
            this.activeBlockType = 'thinking';
            yield formatSSEEvent('content_block_start', {
              type: 'content_block_start',
              index: this.currentBlockIndex,
              content_block: { type: 'thinking', thinking: '' },
            });
          }
          yield formatSSEEvent('content_block_delta', {
            type: 'content_block_delta',
            index: this.currentBlockIndex,
            delta: { type: 'thinking_delta', thinking: contentText },
          });
          return;
        }
      }

      // Normal text output
      if (this.activeBlockType !== 'text') {
        if (this.activeBlockType !== 'none') {
          yield formatSSEEvent('content_block_stop', {
            type: 'content_block_stop',
            index: this.currentBlockIndex,
          });
        }
        this.currentBlockIndex++;
        this.activeBlockType = 'text';
        yield formatSSEEvent('content_block_start', {
          type: 'content_block_start',
          index: this.currentBlockIndex,
          content_block: {
            type: 'text',
            text: '',
          },
        });
      }

      this.outputTokens++;
      yield formatSSEEvent('content_block_delta', {
        type: 'content_block_delta',
        index: this.currentBlockIndex,
        delta: {
          type: 'text_delta',
          text: contentText,
        },
      });
      return;
    }

    // 4. Handle Tool Calls
    if (delta.tool_calls && delta.tool_calls.length > 0) {
      for (const tc of delta.tool_calls) {
        const tcIndex = tc.index ?? 0;

        if (this.activeBlockType !== 'tool_use' || this.activeToolCallIndex !== tcIndex) {
          if (this.activeBlockType !== 'none') {
            yield formatSSEEvent('content_block_stop', {
              type: 'content_block_stop',
              index: this.currentBlockIndex,
            });
          }

          this.currentBlockIndex++;
          this.activeBlockType = 'tool_use';
          this.activeToolCallIndex = tcIndex;
          this.currentToolCallId = tc.id || `toolu_${crypto.randomUUID().slice(0, 14)}`;
          this.currentToolCallName = tc.function?.name || this.currentToolCallName || 'tool';

          yield formatSSEEvent('content_block_start', {
            type: 'content_block_start',
            index: this.currentBlockIndex,
            content_block: {
              type: 'tool_use',
              id: this.currentToolCallId,
              name: this.currentToolCallName,
              input: {},
            },
          });
        } else if (tc.function?.name && !this.currentToolCallName) {
          this.currentToolCallName = tc.function.name;
        }

        if (tc.function?.arguments) {
          this.outputTokens++;
          yield formatSSEEvent('content_block_delta', {
            type: 'content_block_delta',
            index: this.currentBlockIndex,
            delta: {
              type: 'input_json_delta',
              partial_json: tc.function.arguments,
            },
          });
        }
      }
    }
  }

  public *finalize(): Generator<string, void, unknown> {
    // If message_start was never emitted (e.g. empty output)
    if (!this.hasEmittedMessageStart) {
      this.hasEmittedMessageStart = true;
      yield formatSSEEvent('message_start', {
        type: 'message_start',
        message: {
          id: this.messageId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: this.requestedModel,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: this.inputTokens,
            output_tokens: 0,
          },
        },
      });
    }

    // Close any active block
    if (this.activeBlockType !== 'none') {
      yield formatSSEEvent('content_block_stop', {
        type: 'content_block_stop',
        index: this.currentBlockIndex,
      });
      this.activeBlockType = 'none';
    }

    let stopReason = 'end_turn';
    if (this.finishReason === 'tool_calls') {
      stopReason = 'tool_use';
    } else if (this.finishReason === 'length') {
      stopReason = 'max_tokens';
    }

    yield formatSSEEvent('message_delta', {
      type: 'message_delta',
      delta: {
        stop_reason: stopReason,
        stop_sequence: null,
      },
      usage: {
        output_tokens: Math.max(1, this.outputTokens),
      },
    });

    yield formatSSEEvent('message_stop', {
      type: 'message_stop',
    });
  }
}
