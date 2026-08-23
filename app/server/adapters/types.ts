// Anthropic Types

export interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

export interface AnthropicImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<AnthropicTextBlock | AnthropicImageBlock>;
  is_error?: boolean;
}

export interface AnthropicThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock
  | AnthropicThinkingBlock;

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

export type AnthropicToolChoice =
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'tool'; name: string };

export interface AnthropicThinkingConfig {
  type: 'enabled';
  budget_tokens: number;
}

export interface AnthropicMessagesRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string | Array<{ type: 'text'; text: string }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  tools?: AnthropicTool[];
  tool_choice?: AnthropicToolChoice;
  thinking?: AnthropicThinkingConfig;
  stream?: boolean;
  stop_sequences?: string[];
  metadata?: Record<string, unknown>;
}

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface AnthropicMessageResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}

// OpenAI Types

export interface OpenAIFunctionCall {
  name: string;
  arguments: string;
}

export interface OpenAIToolCall {
  index?: number;
  id: string;
  type: 'function';
  function: OpenAIFunctionCall;
}

export interface OpenAIMessage {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  tools?: OpenAITool[];
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } };
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stream_options?: {
    include_usage: boolean;
  };
  stop?: string[];
}

export interface OpenAIChoiceDelta {
  role?: string;
  content?: string | null;
  reasoning_content?: string | null;
  reasoning?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: 'function';
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

export interface OpenAIChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: OpenAIChoiceDelta;
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      reasoning_content?: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
