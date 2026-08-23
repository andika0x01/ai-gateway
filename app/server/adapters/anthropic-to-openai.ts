import type {
  AnthropicMessagesRequest,
  AnthropicContentBlock,
  AnthropicToolResultBlock,
  OpenAIChatRequest,
  OpenAIMessage,
  OpenAITool,
  OpenAIToolCall,
} from './types';

export function convertAnthropicToOpenAI(
  anthropicReq: AnthropicMessagesRequest,
  targetModelName: string,
  options?: {
    supportsThinking?: boolean;
    supportsTools?: boolean;
  }
): OpenAIChatRequest {
  const openAIMessages: OpenAIMessage[] = [];

  // 1. Process System Prompt
  if (anthropicReq.system) {
    let systemText = '';
    if (typeof anthropicReq.system === 'string') {
      systemText = anthropicReq.system;
    } else if (Array.isArray(anthropicReq.system)) {
      systemText = anthropicReq.system.map((b) => b.text).join('\n\n');
    }
    if (systemText.trim()) {
      openAIMessages.push({
        role: 'system',
        content: systemText,
      });
    }
  }

  // 2. Process Message History
  for (const msg of anthropicReq.messages) {
    if (typeof msg.content === 'string') {
      openAIMessages.push({
        role: msg.role,
        content: msg.content,
      });
      continue;
    }

    if (Array.isArray(msg.content)) {
      if (msg.role === 'user') {
        const textParts: string[] = [];
        const imageParts: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
        const toolResultBlocks: AnthropicToolResultBlock[] = [];

        for (const block of msg.content as AnthropicContentBlock[]) {
          if (block.type === 'text') {
            textParts.push(block.text);
          } else if (block.type === 'image') {
            const dataUri = `data:${block.source.media_type};base64,${block.source.data}`;
            imageParts.push({
              type: 'image_url',
              image_url: { url: dataUri },
            });
          } else if (block.type === 'tool_result') {
            toolResultBlocks.push(block);
          }
        }

        // If there are tool results, each tool result becomes a separate message with role: 'tool'
        for (const tr of toolResultBlocks) {
          let resultContent = '';
          if (typeof tr.content === 'string') {
            resultContent = tr.content;
          } else if (Array.isArray(tr.content)) {
            resultContent = tr.content
              .map((c) => (c.type === 'text' ? c.text : JSON.stringify(c)))
              .join('\n');
          } else {
            resultContent = JSON.stringify(tr.content);
          }

          if (tr.is_error) {
            resultContent = `Error: ${resultContent}`;
          }

          openAIMessages.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id,
            content: resultContent,
          });
        }

        // If there is regular text or images along with tool results or on their own
        if (textParts.length > 0 || imageParts.length > 0) {
          if (imageParts.length > 0) {
            const compositeContent: any[] = [];
            if (textParts.length > 0) {
              compositeContent.push({ type: 'text', text: textParts.join('\n') });
            }
            compositeContent.push(...imageParts);
            openAIMessages.push({
              role: 'user',
              content: compositeContent,
            });
          } else {
            openAIMessages.push({
              role: 'user',
              content: textParts.join('\n'),
            });
          }
        }
      } else if (msg.role === 'assistant') {
        const textParts: string[] = [];
        const toolCalls: OpenAIToolCall[] = [];

        for (const block of msg.content as AnthropicContentBlock[]) {
          if (block.type === 'text') {
            textParts.push(block.text);
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: typeof block.input === 'string' ? block.input : JSON.stringify(block.input || {}),
              },
            });
          }
        }

        const assistantMsg: OpenAIMessage = {
          role: 'assistant',
          content: textParts.length > 0 ? textParts.join('\n') : (toolCalls.length > 0 ? null : ''),
        };

        if (toolCalls.length > 0) {
          assistantMsg.tool_calls = toolCalls;
        }

        openAIMessages.push(assistantMsg);
      }
    }
  }

  // 3. Process Tools
  let openAITools: OpenAITool[] | undefined;
  if (options?.supportsTools !== false && anthropicReq.tools && anthropicReq.tools.length > 0) {
    openAITools = anthropicReq.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema || { type: 'object', properties: {} },
      },
    }));
  }

  // 4. Process Tool Choice
  let openAIToolChoice: OpenAIChatRequest['tool_choice'] = undefined;
  if (anthropicReq.tool_choice && openAITools && openAITools.length > 0) {
    if (anthropicReq.tool_choice.type === 'auto') {
      openAIToolChoice = 'auto';
    } else if (anthropicReq.tool_choice.type === 'any') {
      openAIToolChoice = 'required';
    } else if (anthropicReq.tool_choice.type === 'tool' && anthropicReq.tool_choice.name) {
      openAIToolChoice = {
        type: 'function',
        function: { name: anthropicReq.tool_choice.name },
      };
    }
  }

  // 5. Construct final OpenAI Request
  const openAIReq: OpenAIChatRequest = {
    model: targetModelName,
    messages: openAIMessages,
    stream: anthropicReq.stream ?? true,
  };

  if (openAITools && openAITools.length > 0) {
    openAIReq.tools = openAITools;
    if (openAIToolChoice) {
      openAIReq.tool_choice = openAIToolChoice;
    }
  }

  if (anthropicReq.max_tokens) {
    openAIReq.max_tokens = anthropicReq.max_tokens;
    openAIReq.max_completion_tokens = anthropicReq.max_tokens;
  }

  // Temperature & Top P (omit or default for pure reasoning models if needed)
  if (anthropicReq.temperature !== undefined) {
    openAIReq.temperature = anthropicReq.temperature;
  }
  if (anthropicReq.top_p !== undefined) {
    openAIReq.top_p = anthropicReq.top_p;
  }
  if (anthropicReq.stop_sequences && anthropicReq.stop_sequences.length > 0) {
    openAIReq.stop = anthropicReq.stop_sequences;
  }

  if (openAIReq.stream) {
    openAIReq.stream_options = {
      include_usage: true,
    };
  }

  return openAIReq;
}
