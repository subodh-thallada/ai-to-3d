import Anthropic from "@anthropic-ai/sdk";
import { LLM_CONCURRENCY, LLM_TIMEOUT_MS, MODEL_FAST, MODEL_HEAVY, type Effort } from "./config";

/** True when credentials for the Anthropic API are configured. */
export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  // SDK-level retries handle transient transport errors; our own loop handles the rest.
  if (!_client) _client = new Anthropic({ maxRetries: 1, timeout: LLM_TIMEOUT_MS });
  return _client;
}

/* ------------------------------------------------------------------ */
/* Concurrency limiter                                                 */
/* ------------------------------------------------------------------ */

let active = 0;
const waiters: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (active < LLM_CONCURRENCY) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}

function release(): void {
  active--;
  const next = waiters.shift();
  if (next) next();
}

/* ------------------------------------------------------------------ */
/* Structured call                                                     */
/* ------------------------------------------------------------------ */

export interface StructuredRequest {
  model: string;
  system: string;
  user: string;
  toolName: string;
  toolDescription?: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  effort?: Effort;
  /** Optional semantic check of the tool input; return an error message to retry with feedback. */
  validate?: (data: unknown) => string | null;
  /** Called on each retry with a human-readable reason (for logs). */
  onRetry?: (attempt: number, reason: string) => void;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  tokensIn: number;
  tokensOut: number;
  ms: number;
  /** True when the output hit max_tokens on the final attempt and was partially parsed. */
  truncated: boolean;
  attempts: number;
}

export class LlmError extends Error {
  tokensIn: number;
  tokensOut: number;
  constructor(message: string, tokensIn = 0, tokensOut = 0) {
    super(message);
    this.name = "LlmError";
    this.tokensIn = tokensIn;
    this.tokensOut = tokensOut;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MAX_ATTEMPTS = 3; // first try + 2 retries

function isRetryableApiError(err: unknown): boolean {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.InternalServerError) return true;
  if (err instanceof Anthropic.APIConnectionError) return true; // includes timeouts
  if (err instanceof Anthropic.APIError) {
    const s = err.status ?? 0;
    return s === 408 || s === 409 || s === 429 || s >= 500;
  }
  // Errors thrown from inside the stream (e.g. overloaded_error event) are surfaced as APIError or plain Error.
  const msg = String((err as Error)?.message || err);
  return /overloaded|timeout|ECONNRESET|socket hang up|terminated|network/i.test(msg);
}

/** Try to pull a JSON object out of free text (fallback when the model answered in text instead of calling the tool). */
function extractJsonFromText(text: string): unknown | undefined {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fence?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(c.slice(start, end + 1));
      } catch {
        /* try next */
      }
    }
  }
  return undefined;
}

/** Read the tool input from a streamed tool_use block: strict JSON first, partial parse as fallback. */
function readToolInput(block: Anthropic.ToolUseBlock): { value: unknown; strict: boolean } {
  const raw = (block as unknown as Record<string, unknown>)["__json_buf"];
  if (typeof raw === "string" && raw.length > 0) {
    try {
      return { value: JSON.parse(raw), strict: true };
    } catch {
      /* fall through to partial */
    }
    try {
      return { value: block.input, strict: false };
    } catch {
      return { value: undefined, strict: false };
    }
  }
  return { value: block.input, strict: true };
}

/**
 * Call Claude and get back the input of exactly one call to `toolName`.
 * Uses streaming (finalMessage) so long generations never hit HTTP timeouts.
 * Claude Opus 5.5 / Sonnet 5.5 reject forced tool_choice, so we use tool_choice auto with a single
 * tool + explicit instruction, and retry when the model does not call it.
 */
export async function callStructured<T = unknown>(req: StructuredRequest): Promise<StructuredResult<T>> {
  const started = Date.now();
  let tokensIn = 0;
  let tokensOut = 0;
  let model = req.model;
  let maxTokens = req.maxTokens;
  let lastError = "unknown error";
  let nudge = "";
  let partial: unknown = undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isLast = attempt === MAX_ATTEMPTS;
    await acquire();
    let msg: Anthropic.Message;
    try {
      const stream = client().messages.stream(
        {
          model,
          max_tokens: maxTokens,
          system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
          messages: [
            {
              role: "user",
              content:
                req.user +
                `\n\nRespond by calling the \`${req.toolName}\` tool exactly once with the complete result. Do not reply with plain text.` +
                nudge,
            },
          ],
          tools: [
            {
              name: req.toolName,
              description: req.toolDescription || `Submit the result.`,
              input_schema: req.schema as Anthropic.Tool.InputSchema,
              // Eager (unbuffered) input streaming is deliberately OFF: we only consume the final
              // message, and with it on the API stops validating tool JSON (we saw malformed arrays
              // in long CAD outputs). Buffered input arrives as well-formed JSON.
              eager_input_streaming: false,
            },
          ],
          tool_choice: { type: "auto", disable_parallel_tool_use: true },
          ...(req.effort ? { output_config: { effort: req.effort } } : {}),
        },
        { timeout: LLM_TIMEOUT_MS },
      );
      msg = await stream.finalMessage();
    } catch (err) {
      release();
      lastError = err instanceof Error ? err.message : String(err);
      if (err instanceof Anthropic.APIError && !isRetryableApiError(err)) {
        // 400/401/403/404: retrying the same request will not help.
        throw new LlmError(`API error ${err.status ?? ""}: ${lastError}`.trim(), tokensIn, tokensOut);
      }
      if (!isLast) {
        req.onRetry?.(attempt, `API error: ${lastError.slice(0, 160)}`);
        await sleep(2000 * attempt * attempt);
        continue;
      }
      break;
    }
    release();

    const u = msg.usage;
    tokensIn += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    tokensOut += u.output_tokens || 0;

    if (msg.stop_reason === "refusal") {
      lastError = "model declined the request (refusal)";
      // Client-side fallback: retry on the other model tier.
      model = model === MODEL_HEAVY ? MODEL_FAST : MODEL_HEAVY;
      if (!isLast) {
        req.onRetry?.(attempt, `refusal, retrying on ${model}`);
        continue;
      }
      break;
    }

    const toolBlock = msg.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === req.toolName,
    );

    if (toolBlock) {
      const { value, strict } = readToolInput(toolBlock);
      const usable = value && typeof value === "object";
      if (msg.stop_reason === "max_tokens" || !strict) {
        // Output was cut off. Keep the partial result in case every attempt truncates.
        if (usable) partial = value;
        lastError = `output truncated at max_tokens=${maxTokens}`;
        if (!isLast) {
          maxTokens = Math.min(Math.round(maxTokens * 1.6), 64000);
          nudge = "\n\nIMPORTANT: your previous answer was too long and got cut off. Be more concise (shorter descriptions, fewer words), but keep the result complete.";
          req.onRetry?.(attempt, `${lastError}; retrying with max_tokens=${maxTokens}`);
          continue;
        }
        break;
      }
      const invalid = usable ? req.validate?.(value) ?? null : "tool input was empty or not an object";
      if (!invalid) {
        return { data: value as T, model, tokensIn, tokensOut, ms: Date.now() - started, truncated: false, attempts: attempt };
      }
      lastError = invalid;
      nudge = `\n\nIMPORTANT: your previous answer was rejected: ${invalid}. Call \`${req.toolName}\` again with a complete, well-formed result (arrays as real JSON arrays, not strings).`;
    } else {
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const json = text ? extractJsonFromText(text) : undefined;
      if (json && typeof json === "object") {
        return { data: json as T, model, tokensIn, tokensOut, ms: Date.now() - started, truncated: false, attempts: attempt };
      }
      lastError = `model did not call ${req.toolName} (stop_reason=${msg.stop_reason})`;
      if (msg.stop_reason === "max_tokens") maxTokens = Math.min(Math.round(maxTokens * 1.6), 64000);
      nudge = `\n\nIMPORTANT: you MUST call the \`${req.toolName}\` tool. Plain-text answers are discarded.`;
    }

    if (!isLast) {
      req.onRetry?.(attempt, lastError);
      await sleep(1000 * attempt);
    }
  }

  if (partial && typeof partial === "object") {
    return { data: partial as T, model, tokensIn, tokensOut, ms: Date.now() - started, truncated: true, attempts: MAX_ATTEMPTS };
  }
  throw new LlmError(lastError, tokensIn, tokensOut);
}
