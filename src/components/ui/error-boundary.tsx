"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unbekannter Fehler",
    };
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-error-container/20 text-error text-xl">
            ⚠
          </div>
          <div>
            <p className="font-medium text-on-surface">Etwas ist schiefgelaufen</p>
            <p className="text-xs text-on-surface-variant/60 mt-1 font-mono">{this.state.message}</p>
          </div>
          <button
            onClick={() => { this.setState({ hasError: false, message: "" }); }}
            className="rounded-lg bg-surface-container px-4 py-2 text-sm text-on-surface hover:bg-surface-container-high transition-colors"
          >
            Erneut versuchen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
