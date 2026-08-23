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
import { cleanAndParseJSON, extractTextToolCalls } from './json-repair';

// Non-streaming response converter
export function convertOpenAIToAnthropicResponse(
  openAIRes: OpenAIChatResponse,
  requestedModel: string
): AnthropicMessageResponse {
  const choice = openAIRes.choices[0];
  const message = choice?.message;
  const contentBlocks: AnthropicContentBlock[] = [];
  let hasTools = false;

  // 1. Process Reasoning Content
  if (message?.reasoning_content) {
    contentBlocks.push({
      type: 'thinking',
      thinking: message.reasoning_content,
    } as AnthropicThinkingBlock);
  }

  // 2. Process Message Content
  let mainContent = message?.content || '';
  if (mainContent) {
    // Check if content has embedded <think>...</think>
    const thinkMatch = mainContent.match(/^<think>([\s\S]*?)<\/think>([\s\S]*)$/);
    if (thinkMatch) {
      if (thinkMatch[1].trim()) {
        contentBlocks.push({
          type: 'thinking',
          thinking: thinkMatch[1].trim(),
        } as AnthropicThinkingBlock);
      }
      mainContent = thinkMatch[2].trim();
    }
  }

  // 3. Process Native Tool Calls
  if (message?.tool_calls && message.tool_calls.length > 0) {
    hasTools = true;
    for (const tc of message.tool_calls) {
      const parsedInput = cleanAndParseJSON(tc.function?.arguments || '{}');
      contentBlocks.push({
        type: 'tool_use',
        id: tc.id || `toolu_${crypto.randomUUID().slice(0, 16)}`,
        name: tc.function?.name || 'tool',
        input: parsedInput,
      } as AnthropicToolUseBlock);
    }
  } else if (mainContent) {
    // Fallback: Check if model generated text-based tool calls (e.g. <tool_call>, ```json ..., <invoke>)
    const textToolCalls = extractTextToolCalls(mainContent);
    if (textToolCalls.length > 0) {
      hasTools = true;
      for (const ttc of textToolCalls) {
        contentBlocks.push({
          type: 'tool_use',
          id: ttc.id || `toolu_${crypto.randomUUID().slice(0, 16)}`,
          name: ttc.name,
          input: ttc.arguments,
        } as AnthropicToolUseBlock);
        if (ttc.rawText) {
          mainContent = mainContent.replace(ttc.rawText, '').trim();
        }
      }
    }
  }

  // Add text block if there is remaining text content
  if (mainContent) {
    contentBlocks.push({
      type: 'text',
      text: mainContent,
    } as AnthropicTextBlock);
  }

  let stopReason: 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' = 'end_turn';
  if (hasTools || choice?.finish_reason === 'tool_calls') {
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

interface ToolStreamState {
  id: string;
  name: string;
  blockIndex: number;
  started: boolean;
  stopped: boolean;
  arguments: string;
}

// Streaming SSE Transformer class
export class OpenAISSEStreamTransformer {
  private messageId: string;
  private requestedModel: string;
  private hasEmittedMessageStart = false;
  private currentBlockIndex = -1;
  private activeBlockType: 'none' | 'thinking' | 'text' = 'none';
  private insideThinkTag = false;
  private inputTokens = 0;
  private outputTokens = 0;
  private finishReason: string | null = null;

  // Tool calls state tracking by tool index
  private toolStates = new Map<number, ToolStreamState>();
  private hasNativeToolCalls = false;
  private accumulatedText = '';

  constructor(requestedModel: string, estimatedInputTokens = 0) {
    this.messageId = `msg_${crypto.randomUUID().slice(0, 16)}`;
    this.requestedModel = requestedModel;
    this.inputTokens = estimatedInputTokens;
  }

  private *closeActiveTextBlock(): Generator<string, void, unknown> {
    if (this.activeBlockType !== 'none') {
      yield formatSSEEvent('content_block_stop', {
        type: 'content_block_stop',
        index: this.currentBlockIndex,
      });
      this.activeBlockType = 'none';
    }
  }

  public *processChunk(chunk: OpenAIChunk): Generator<string, void, unknown> {
    const choice = chunk.choices?.[0];
    const delta = choice?.delta;

    // Capture usage if provided in chunk
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

    // 2. Handle Reasoning Content (from DeepSeek-R1 / NIM / reasoning models)
    const reasoningText = delta.reasoning_content || delta.reasoning;
    if (reasoningText) {
      if (this.activeBlockType !== 'thinking') {
        yield* this.closeActiveTextBlock();
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
      // NOTE: Do NOT return here! The same chunk may contain delta.tool_calls or delta.content!
    }

    // 3. Handle Regular Content
    if (delta.content !== undefined && delta.content !== null && delta.content !== '') {
      let contentText = delta.content;

      // Handle <think> tags if embedded in content text
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
              yield* this.closeActiveTextBlock();
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

          yield* this.closeActiveTextBlock();
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
            this.accumulatedText += textPart;
          }
        } else {
          // Still inside think tag
          if (this.activeBlockType !== 'thinking') {
            yield* this.closeActiveTextBlock();
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
        }
      } else {
        // Normal text output
        if (this.activeBlockType !== 'text') {
          yield* this.closeActiveTextBlock();
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
        this.accumulatedText += contentText;
      }
    }

    // 4. Handle Tool Calls
    if (delta.tool_calls && delta.tool_calls.length > 0) {
      this.hasNativeToolCalls = true;
      yield* this.closeActiveTextBlock();

      for (const tc of delta.tool_calls) {
        const tcIndex = tc.index ?? 0;
        let state = this.toolStates.get(tcIndex);

        if (!state) {
          state = {
            id: tc.id || `toolu_${crypto.randomUUID().slice(0, 16)}`,
            name: tc.function?.name || '',
            blockIndex: -1,
            started: false,
            stopped: false,
            arguments: '',
          };
          this.toolStates.set(tcIndex, state);
        } else {
          if (tc.id && !state.id) state.id = tc.id;
          if (tc.function?.name && !state.name) state.name = tc.function.name;
        }

        // Start the tool content block if not started yet
        if (!state.started) {
          this.currentBlockIndex++;
          state.blockIndex = this.currentBlockIndex;
          state.started = true;
          yield formatSSEEvent('content_block_start', {
            type: 'content_block_start',
            index: state.blockIndex,
            content_block: {
              type: 'tool_use',
              id: state.id,
              name: state.name || 'tool',
              input: {},
            },
          });
        }

        if (tc.function?.arguments) {
          state.arguments += tc.function.arguments;
          this.outputTokens++;
          yield formatSSEEvent('content_block_delta', {
            type: 'content_block_delta',
            index: state.blockIndex,
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
    // If message_start was never emitted
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

    // Close any active thinking or text block
    yield* this.closeActiveTextBlock();

    // Close all open tool blocks in order
    const sortedToolIndices = Array.from(this.toolStates.keys()).sort((a, b) => a - b);
    for (const idx of sortedToolIndices) {
      const state = this.toolStates.get(idx);
      if (state && state.started && !state.stopped) {
        state.stopped = true;
        yield formatSSEEvent('content_block_stop', {
          type: 'content_block_stop',
          index: state.blockIndex,
        });
      }
    }

    // Fallback: If no native tool calls were emitted, check accumulated text for text-based tool calls
    let hasExtractedTools = false;
    if (!this.hasNativeToolCalls && this.accumulatedText) {
      const textTools = extractTextToolCalls(this.accumulatedText);
      if (textTools.length > 0) {
        hasExtractedTools = true;
        for (const ttc of textTools) {
          this.currentBlockIndex++;
          const toolId = ttc.id || `toolu_${crypto.randomUUID().slice(0, 16)}`;
          yield formatSSEEvent('content_block_start', {
            type: 'content_block_start',
            index: this.currentBlockIndex,
            content_block: {
              type: 'tool_use',
              id: toolId,
              name: ttc.name,
              input: {},
            },
          });
          yield formatSSEEvent('content_block_delta', {
            type: 'content_block_delta',
            index: this.currentBlockIndex,
            delta: {
              type: 'input_json_delta',
              partial_json: JSON.stringify(ttc.arguments),
            },
          });
          yield formatSSEEvent('content_block_stop', {
            type: 'content_block_stop',
            index: this.currentBlockIndex,
          });
        }
      }
    }

    let stopReason = 'end_turn';
    if (
      this.hasNativeToolCalls ||
      hasExtractedTools ||
      this.finishReason === 'tool_calls' ||
      this.toolStates.size > 0
    ) {
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
