"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { isTextUIPart } from "ai";
import { cn } from "@/lib/utils/cn";

export default function CoachPage() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = status === "streaming" || status === "submitted";

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-outline-variant/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-container/20">
            <span className="font-headline text-sm font-bold text-primary">A</span>
          </div>
          <div>
            <h1 className="font-headline text-sm font-bold text-on-surface">Atlas</h1>
            <p className="text-xs text-on-surface-variant">AI Strength Coach</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                isStreaming ? "bg-primary animate-pulse" : "bg-secondary"
              )}
            />
            <span className="text-xs text-on-surface-variant">
              {isStreaming ? "Antwortet..." : "Bereit"}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="hide-scrollbar flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <EmptyState onPrompt={(text) => { sendMessage({ text }); }} />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.map((msg) => {
              const textContent = msg.parts
                .filter(isTextUIPart)
                .map((p) => p.text)
                .join("");

              if (!textContent && msg.role !== "assistant") return null;

              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-container/20">
                      <span className="font-headline text-xs font-bold text-primary">A</span>
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-xl px-4 py-3 text-sm",
                      msg.role === "user"
                        ? "bg-primary-container text-on-primary rounded-br-sm"
                        : "bg-surface-container text-on-surface rounded-bl-sm"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <MarkdownText text={textContent} />
                    ) : (
                      <p className="whitespace-pre-wrap">{textContent}</p>
                    )}

                    {/* Streaming cursor */}
                    {msg.role === "assistant" &&
                      isStreaming &&
                      msg === messages[messages.length - 1] && (
                        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary align-middle" />
                      )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-outline-variant/10 bg-surface/80 px-4 py-4 backdrop-blur-sm">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-4xl items-end gap-3"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Frag Atlas..."
            rows={1}
            className="hide-scrollbar flex-1 resize-none rounded-xl bg-surface-container px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none transition-all focus:bg-surface-container-high"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
              input.trim() && !isStreaming
                ? "bg-primary text-on-primary hover:opacity-90"
                : "bg-surface-container text-on-surface-variant opacity-50 cursor-not-allowed"
            )}
          >
            <SendIcon />
          </button>
        </form>
        <p className="mt-2 text-center text-xs text-on-surface-variant/50">
          Enter zum Senden · Shift+Enter für neue Zeile
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function EmptyState({ onPrompt }: { onPrompt: (text: string) => void }) {
  const STARTERS = [
    "Erstelle mir einen Trainingsplan für Muskelaufbau",
    "Wie optimiere ich meine Kniebeuge-Technik?",
    "Was ist der Unterschied zwischen RPE und RIR?",
    "Wie plane ich Deload-Wochen richtig?",
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-container/20">
        <span className="font-headline text-2xl font-bold text-primary">A</span>
      </div>
      <h2 className="font-headline text-xl font-bold text-on-surface">
        Bereit zu trainieren?
      </h2>
      <p className="mt-2 text-sm text-on-surface-variant">
        Stell Atlas eine Frage oder starte direkt mit einem der Vorschlaege.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {STARTERS.map((s) => (
          <button
            key={s}
            onClick={() => onPrompt(s)}
            className="rounded-xl bg-surface-container px-4 py-3 text-left text-sm text-on-surface-variant transition-all hover:bg-surface-container-high hover:text-on-surface"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Minimal markdown renderer: bold, inline code, bullet lists, line breaks */
function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <p key={i} className="font-headline font-semibold text-on-surface mt-2 first:mt-0">
              {renderInline(line.slice(3))}
            </p>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <p key={i} className="font-headline font-bold text-on-surface mt-2 first:mt-0">
              {renderInline(line.slice(2))}
            </p>
          );
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={i} className="flex gap-2">
              <span className="mt-px shrink-0 text-primary">·</span>
              <span>{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // Bold: **text**
  // Inline code: `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-on-surface">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-surface-container-highest px-1 py-0.5 font-mono text-xs text-primary">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 8L2 2L5 8L2 14L14 8Z" fill="currentColor" />
    </svg>
  );
}
