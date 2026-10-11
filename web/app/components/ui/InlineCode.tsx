import type { ComponentProps, ReactNode } from "react";

/** A short code span in GitHub's look: monospace on a faint tinted background. */
export function InlineCode({ className = "", ...props }: ComponentProps<"code">) {
  return (
    <code className={`rounded-sm bg-inline-code-bg px-1 py-0.5 font-mono text-[85%] ${className}`.trim()} {...props} />
  );
}

/** Renders a message, showing each `backticked` span as inline code. */
export function withInlineCode(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let offset = 0;
  let code = false;
  for (const part of text.split("`")) {
    // Keyed by where the span starts in the message, which is unique and stable.
    nodes.push(code ? <InlineCode key={offset}>{part}</InlineCode> : part);
    offset += part.length + 1;
    code = !code;
  }
  return nodes;
}
