import type Anthropic from "@anthropic-ai/sdk";

// Adds up the tokens from every response so we can cap the total spend.
export class UsageTracker {
  inputTokens = 0;
  outputTokens = 0;

  constructor(readonly maxTokens = 1_000_000) {}

  add(usage: Anthropic.Usage): void {
    // Cached input still counts as input, so include both cache fields.
    this.inputTokens +=
      usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0);
    this.outputTokens += usage.output_tokens;
  }

  get total(): number {
    return this.inputTokens + this.outputTokens;
  }

  isOverLimit(): boolean {
    return this.total > this.maxTokens;
  }

  format(): string {
    const n = (x: number) => x.toLocaleString("en-US");
    return `tokens: ${n(this.total)} (${n(this.inputTokens)} in, ${n(this.outputTokens)} out)`;
  }
}
