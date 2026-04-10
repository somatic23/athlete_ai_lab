"use client";

import { cn } from "@/lib/utils/cn";

interface Column<T> {
  key: keyof T | string;
  label: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  isDeleting?: string | null;
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  onEdit,
  onDelete,
  isDeleting,
}: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface-container">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-container-high">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={cn(
                  "px-4 py-3 text-left text-xs font-medium uppercase tracking-widest text-on-surface-variant",
                  col.className
                )}
              >
                {col.label}
              </th>
            ))}
            {(onEdit || onDelete) && (
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                Aktionen
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + 1}
                className="px-4 py-8 text-center text-on-surface-variant"
              >
                Keine Eintraege vorhanden
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={row.id}
                className={cn(
                  "border-t border-outline-variant/10 transition-colors",
                  i % 2 === 0 ? "bg-surface-container" : "bg-surface-container-low",
                  "hover:bg-surface-container-high"
                )}
              >
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className={cn("px-4 py-3 text-on-surface", col.className)}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[String(col.key)] ?? "—")}
                  </td>
                ))}
                {(onEdit || onDelete) && (
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {onEdit && (
                        <button
                          onClick={() => onEdit(row)}
                          className="rounded px-2 py-1 text-xs font-medium text-secondary hover:bg-secondary-container/20 transition-colors"
                        >
                          Bearbeiten
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(row)}
                          disabled={isDeleting === row.id}
                          className="rounded px-2 py-1 text-xs font-medium text-error hover:bg-error-container/20 transition-colors disabled:opacity-50"
                        >
                          {isDeleting === row.id ? "..." : "Loeschen"}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
