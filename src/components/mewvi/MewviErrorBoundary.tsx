"use client";

import { Component, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";

/**
 * If anything inside Mewvi throws while rendering, show this small card instead of letting the error
 * reach the page. The links go to existing ASSURED pages that work without any AI.
 */
export class MewviErrorBoundary extends Component<{ onClose: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alertdialog" aria-label="Mewvi is unavailable" className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md rounded-t-2xl border border-border bg-surface p-4 shadow-soft-hover sm:bottom-6 sm:left-auto sm:right-6 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold">Mewvi ran into a problem.</p>
          <button type="button" onClick={this.props.onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-2">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">The rest of ASSURED still works. If you need help now, these pages don&apos;t need Mewvi:</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/emergency" onClick={this.props.onClose} className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">
            Emergency page
          </Link>
          <Link href="/helplines" onClick={this.props.onClose} className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm hover:bg-surface-2">
            Helplines
          </Link>
        </div>
      </div>
    );
  }
}
