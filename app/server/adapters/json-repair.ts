/**
 * JSON Repair and Text-based Tool Call Extractor Utilities
 * Handles malformed JSON, relaxed syntax, markdown fences, and text-based tool calls from LLMs.
 */

/**
 * Attempts to parse a JSON string into an object, repairing common LLM formatting issues:
 * - Markdown code blocks (```json ... ```)
 * - Trailing commas in objects/arrays
 * - Single quotes instead of double quotes
 * - Unescaped control characters
 * - Loose JSON substrings within text
 */
export function cleanAndParseJSON(rawInput: unknown): Record<string, unknown> {
  if (!rawInput) {
    return {};
  }

  if (typeof rawInput === 'object' && !Array.isArray(rawInput)) {
    return rawInput as Record<string, unknown>;
  }

  if (typeof rawInput !== 'string') {
    try {
      return JSON.parse(JSON.stringify(rawInput));
    } catch {
      return {};
    }
  }

  let text = rawInput.trim();
  if (!text) {
    return {};
  }

  // 1. First attempt: standard JSON.parse
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed)) {
      return { items: parsed };
    }
    return { value: parsed };
  } catch {}

  // 2. Strip markdown code fences if wrapped
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
  }

  // 3. Extract innermost or outermost { ... }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
  }

  // 4. Sanitize trailing commas and single quotes
  try {
    let repaired = text
      // Replace trailing commas before closing braces/brackets
      .replace(/,\s*([\}\]])/g, '$1')
      // Replace single-quoted keys: 'key': -> "key":
      .replace(/'([a-zA-Z0-9_$-]+)'\s*:/g, '"$1":')
      // Replace unescaped newlines inside strings
      .replace(/[\n\r\t]/g, (match) => (match === '\n' ? '\\n' : match === '\r' ? '\\r' : '\\t'));

    const parsed = JSON.parse(repaired);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}

  // 5. Aggressive regex-based key-value recovery
  try {
    const looseObj: Record<string, unknown> = {};
    const kvRegex = /["']?([a-zA-Z0-9_$-]+)["']?\s*:\s*(["'](?:\\.|[^"'\\])*["']|true|false|null|-?\d+(?:\.\d+)?|\[.*?\]|\{.*?\})/gs;
    let match: RegExpExecArray | null;
    let found = false;

    while ((match = kvRegex.exec(text)) !== null) {
      found = true;
      const key = match[1];
      let valStr = match[2].trim();
      try {
        looseObj[key] = JSON.parse(valStr);
      } catch {
        if ((valStr.startsWith('"') && valStr.endsWith('"')) || (valStr.startsWith("'") && valStr.endsWith("'"))) {
          looseObj[key] = valStr.slice(1, -1);
        } else {
          looseObj[key] = valStr;
        }
      }
    }

    if (found && Object.keys(looseObj).length > 0) {
      return looseObj;
    }
  } catch {}

  // Fallback if everything fails
  return { raw_arguments: text };
}

export interface ExtractedToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
  rawText?: string;
}

/**
 * Extracts tool calls that models might output in plain text/markdown/XML format
 * (e.g. DeepSeek-R1, Qwen 2.5, Llama 3, Hermes, Claude legacy XML).
 */
export function extractTextToolCalls(content: string): ExtractedToolCall[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const toolCalls: ExtractedToolCall[] = [];

  // Pattern 1: <tool_call> ... </tool_call> (DeepSeek-R1 / Qwen / Hermes)
  const toolCallTagRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  let match: RegExpExecArray | null;
  while ((match = toolCallTagRegex.exec(content)) !== null) {
    const rawInner = match[1].trim();
    const parsed = cleanAndParseJSON(rawInner);
    const name = (parsed.name || parsed.tool_name || parsed.function || 'tool') as string;
    const args = (parsed.arguments || parsed.parameters || parsed.input || parsed) as Record<string, unknown>;
    toolCalls.push({
      name,
      arguments: typeof args === 'object' && args !== null ? args : { input: args },
      rawText: match[0],
    });
  }
  if (toolCalls.length > 0) return toolCalls;

  // Pattern 2: [TOOL_CALLS] [...] (Mistral / Llama)
  const toolCallsBracketRegex = /\[TOOL_CALLS\]\s*(\[[\s\S]*?\])/i;
  const bracketMatch = content.match(toolCallsBracketRegex);
  if (bracketMatch) {
    try {
      const arr = JSON.parse(bracketMatch[1]);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (item && typeof item === 'object') {
            const name = item.name || item.function?.name || 'tool';
            const args = item.arguments || item.function?.arguments || item.parameters || {};
            toolCalls.push({
              name,
              arguments: typeof args === 'string' ? cleanAndParseJSON(args) : args,
              rawText: bracketMatch[0],
            });
          }
        }
      }
    } catch {}
  }
  if (toolCalls.length > 0) return toolCalls;

  // Pattern 3: <invoke name="function_name"> ... </invoke> (Claude legacy XML)
  const invokeRegex = /<invoke\s+name=["']([^"']+)["']>([\s\S]*?)<\/invoke>/gi;
  while ((match = invokeRegex.exec(content)) !== null) {
    const name = match[1];
    const inner = match[2];
    const paramRegex = /<parameter\s+name=["']([^"']+)["']>([\s\S]*?)<\/parameter>/gi;
    const args: Record<string, unknown> = {};
    let pMatch: RegExpExecArray | null;
    let hasParams = false;

    while ((pMatch = paramRegex.exec(inner)) !== null) {
      hasParams = true;
      const pName = pMatch[1];
      const pVal = pMatch[2].trim();
      try {
        args[pName] = JSON.parse(pVal);
      } catch {
        args[pName] = pVal;
      }
    }

    if (!hasParams) {
      toolCalls.push({
        name,
        arguments: cleanAndParseJSON(inner),
        rawText: match[0],
      });
    } else {
      toolCalls.push({
        name,
        arguments: args,
        rawText: match[0],
      });
    }
  }
  if (toolCalls.length > 0) return toolCalls;

  // Pattern 4: <function=function_name> ... </function>
  const funcTagRegex = /<function=([a-zA-Z0-9_$-]+)>([\s\S]*?)<\/function>/gi;
  while ((match = funcTagRegex.exec(content)) !== null) {
    const name = match[1];
    const inner = match[2].trim();
    toolCalls.push({
      name,
      arguments: cleanAndParseJSON(inner),
      rawText: match[0],
    });
  }

  return toolCalls;
}
