"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

type Log = {
  id: number;
  level: string;
  message: string;
  metadata: string | null;
  userId: string | null;
  createdAt: string;
};

const LEVELS = ["all", "debug", "info", "warn", "error"];

const levelColors: Record<string, string> = {
  debug: "text-on-surface-variant",
  info:  "text-secondary",
  warn:  "text-tertiary",
  error: "text-error",
};

const levelBg: Record<string, string> = {
  debug: "bg-surface-container-high",
  info:  "bg-secondary-container/20",
  warn:  "bg-tertiary-container/20",
  error: "bg-error-container/20",
};

function formatJson(raw: string | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function LogDetail({ log, onClose }: { log: Log; onClose: () => void }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const metadata = formatJson(log.metadata);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-xl bg-surface-container shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-outline-variant/10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className={cn("shrink-0 font-mono text-xs font-bold uppercase px-2 py-0.5 rounded", levelBg[log.level], levelColors[log.level])}>
              {log.level}
            </span>
            <span className="font-mono text-sm text-on-surface truncate">{log.message}</span>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Meta row */}
        <div className="flex gap-6 px-6 py-3 text-xs text-on-surface-variant border-b border-outline-variant/10 shrink-0 font-mono">
          <span><span className="text-on-surface-variant/50">ID</span> {log.id}</span>
          <span><span className="text-on-surface-variant/50">Zeit</span> {new Date(log.createdAt).toLocaleString("de-DE")}</span>
          {log.userId && (
            <span className="truncate"><span className="text-on-surface-variant/50">User</span> {log.userId}</span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {metadata ? (
            <pre className="font-mono text-xs text-on-surface whitespace-pre-wrap break-all leading-relaxed">
              {metadata}
            </pre>
          ) : (
            <p className="text-sm text-on-surface-variant italic">Kein Metadata vorhanden.</p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex justify-end gap-2 px-6 py-3 border-t border-outline-variant/10">
          <Button
            variant="ghost"
            onClick={() => navigator.clipboard.writeText(metadata)}
          >
            Kopieren
          </Button>
          <Button variant="ghost" onClick={onClose}>Schliessen</Button>
        </div>
      </div>
    </div>
  );
}

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [level, setLevel] = useState("all");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Log | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = level !== "all" ? `?level=${level}` : "";
    fetch(`/api/admin/logs${params}`)
      .then((r) => r.json())
      .then(setLogs)
      .finally(() => setLoading(false));
  }, [level]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {selected && <LogDetail log={selected} onClose={() => setSelected(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-headline text-2xl font-bold text-on-surface">Logfiles</h2>
          <p className="text-sm text-on-surface-variant">{logs.length} Eintraege</p>
        </div>
        <Button variant="ghost" onClick={load}>Aktualisieren</Button>
      </div>

      {/* Level filter */}
      <div className="mb-4 flex gap-2">
        {LEVELS.map((l) => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-all",
              level === l
                ? "bg-primary-container text-on-primary"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Log entries */}
      <div className="rounded-xl bg-surface-container-low font-mono text-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-on-surface-variant">Laden...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-on-surface-variant">Keine Logs vorhanden</div>
        ) : (
          logs.map((log) => (
            <button
              key={log.id}
              onClick={() => setSelected(log)}
              className="w-full text-left flex gap-4 border-b border-outline-variant/5 px-4 py-2 hover:bg-surface-container transition-colors"
            >
              <span className="shrink-0 text-on-surface-variant/50 tabular-nums">
                {new Date(log.createdAt).toLocaleString("de-DE")}
              </span>
              <span className={cn("shrink-0 w-12 font-bold uppercase text-left", levelColors[log.level] ?? "text-on-surface")}>
                {log.level}
              </span>
              <span className="text-on-surface flex-1 truncate">{log.message}</span>
              {log.metadata && (
                <span className="shrink-0 text-on-surface-variant/50 truncate max-w-48">
                  {log.metadata.slice(0, 80)}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
