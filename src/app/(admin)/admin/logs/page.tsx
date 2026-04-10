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
  info: "text-secondary",
  warn: "text-tertiary",
  error: "text-error",
};

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [level, setLevel] = useState("all");
  const [loading, setLoading] = useState(false);

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
            <div
              key={log.id}
              className="flex gap-4 border-b border-outline-variant/5 px-4 py-2 hover:bg-surface-container transition-colors"
            >
              <span className="shrink-0 text-on-surface-variant/50">
                {new Date(log.createdAt).toLocaleString("de-DE")}
              </span>
              <span className={cn("shrink-0 w-12 font-bold uppercase", levelColors[log.level] ?? "text-on-surface")}>
                {log.level}
              </span>
              <span className="text-on-surface flex-1 break-all">{log.message}</span>
              {log.metadata && (
                <span className="shrink-0 text-on-surface-variant/50 truncate max-w-48">
                  {log.metadata}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
