"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { isTextUIPart } from "ai";
import { cn } from "@/lib/utils/cn";
import { getPersonality } from "@/lib/coach-personalities";

export default function CoachPage() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");
  const [coachName, setCoachName] = useState("Atlas");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p) => { if (p.coachPersonality) setCoachName(getPersonality(p.coachPersonality).label); })
      .catch(() => {});
  }, []);

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
          <div
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, #cafd00 0%, #beee00 50%, #00e3fd 140%)",
              boxShadow: "0 0 16px -2px rgba(202,253,0,0.4)",
            }}
          >
            <span className="font-headline text-sm font-bold text-[#0e0e0e] leading-none">{coachName[0]}</span>
            <span
              className="pulse-dot absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-secondary"
              style={{ border: "2px solid var(--color-surface)" }}
            />
          </div>
          <div>
            <h1 className="display-text text-sm font-bold text-on-surface">{coachName}</h1>
            <p className="mono-text text-[10px] text-on-surface-variant/50">AI STRENGTH COACH</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div
              className="flex items-center gap-2 rounded-full px-2.5 py-1 mono-text text-[10px]"
              style={{
                background: isStreaming ? "rgba(202,253,0,0.07)" : "rgba(0,227,253,0.07)",
                border: `1px solid ${isStreaming ? "rgba(202,253,0,0.2)" : "rgba(0,227,253,0.2)"}`,
                color: isStreaming ? "var(--color-primary-container)" : "var(--color-secondary)",
              }}
            >
              <span
                className={cn("h-1.5 w-1.5 rounded-full shrink-0", isStreaming ? "animate-pulse bg-primary-container" : "pulse-dot bg-secondary")}
              />
              {isStreaming ? "RESPONDING" : "ONLINE"}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="hide-scrollbar flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <EmptyState coachName={coachName} onPrompt={(text) => { sendMessage({ text }); }} />
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
                    <div
                      className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        background: "linear-gradient(135deg, #cafd00 0%, #00e3fd 140%)",
                        boxShadow: "0 0 10px -2px rgba(202,253,0,0.3)",
                      }}
                    >
                      <span className="font-headline text-xs font-bold text-[#0e0e0e] leading-none">{coachName[0]}</span>
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
                      msg.role === "user"
                        ? "bg-primary-container text-on-primary rounded-br-[4px]"
                        : "bg-surface-container text-on-surface rounded-bl-[4px]"
                    )}
                    style={msg.role === "assistant" ? { border: "1px solid rgba(72,72,71,0.18)" } : undefined}
                  >
                    {msg.role === "assistant" ? (
                      <MarkdownText text={textContent} />
                    ) : (
                      <p className="whitespace-pre-wrap">{textContent}</p>
                    )}

                    {/* 3-dot typing indicator */}
                    {msg.role === "assistant" &&
                      isStreaming &&
                      msg === messages[messages.length - 1] && (
                        <span className="ml-1.5 inline-flex items-end gap-0.5 pb-0.5">
                          {[0, 200, 400].map((delay, i) => (
                            <span
                              key={i}
                              className="inline-block h-1 w-1 rounded-full bg-primary-container/60"
                              style={{ animation: "pulse-dot 1.4s ease-in-out infinite", animationDelay: `${delay}ms` }}
                            />
                          ))}
                        </span>
                      )}
                  </div>
                </div>
              );
            })}
            {/* Typing bubble — visible while waiting for first token */}
            {isStreaming && messages[messages.length - 1]?.role === "user" && (
              <div className="flex justify-start">
                <div
                  className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: "linear-gradient(135deg, #cafd00 0%, #00e3fd 140%)",
                    boxShadow: "0 0 10px -2px rgba(202,253,0,0.3)",
                  }}
                >
                  <span className="font-headline text-xs font-bold text-[#0e0e0e] leading-none">{coachName[0]}</span>
                </div>
                <div
                  className="flex items-center gap-1 rounded-2xl rounded-bl-[4px] bg-surface-container px-4 py-3"
                  style={{ border: "1px solid rgba(72,72,71,0.18)" }}
                >
                  {[0, 160, 320].map((delay, i) => (
                    <span
                      key={i}
                      className="inline-block h-2 w-2 rounded-full bg-primary-container/50"
                      style={{ animation: "typing-bounce 1.2s ease-in-out infinite", animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}

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
            placeholder={`Frag ${coachName}...`}
            rows={1}
            className="hide-scrollbar flex-1 resize-none rounded-xl bg-surface-container px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none transition-all focus:bg-surface-container-high"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
              input.trim() && !isStreaming
                ? "btn-liquid text-on-primary hover:opacity-90"
                : "bg-surface-container text-on-surface-variant/40 cursor-not-allowed"
            )}
          >
            <SendIcon />
          </button>
        </form>
        <p className="mt-2 text-center mono-text text-[10px] text-on-surface-variant/30">
          ⏎ {" "}senden · Shift+⏎ neue Zeile · nicht als medizinische Beratung verwenden
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function EmptyState({ coachName, onPrompt }: { coachName: string; onPrompt: (text: string) => void }) {
  const STARTERS = [
    "Erstelle mir einen Trainingsplan für Muskelaufbau",
    "Wie optimiere ich meine Kniebeuge-Technik?",
    "Was ist der Unterschied zwischen RPE und RIR?",
    "Wie plane ich Deload-Wochen richtig?",
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center justify-center py-16 text-center">
      <div
        className="relative mb-6 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl"
        style={{
          background: "linear-gradient(135deg, #cafd00 0%, #beee00 50%, #00e3fd 140%)",
          boxShadow: "0 0 32px -4px rgba(202,253,0,0.5)",
        }}
      >
        <span className="font-headline text-3xl font-bold text-[#0e0e0e] leading-none">{coachName[0]}</span>
      </div>
      <h2 className="display-text text-xl font-bold text-on-surface">
        Bereit zu trainieren?
      </h2>
      <p className="mt-2 text-sm text-on-surface-variant/70">
        Stell {coachName} eine Frage oder starte direkt mit einem der Vorschläge.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {STARTERS.map((s) => (
          <button
            key={s}
            onClick={() => onPrompt(s)}
            className="rounded-xl px-4 py-3 text-left text-sm text-on-surface-variant/80 transition-all hover:text-on-surface"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(72,72,71,0.2)" }}
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
