"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MewviPanel, type MewviTurn } from "@/components/mewvi/MewviPanel";
import { MewviErrorBoundary } from "@/components/mewvi/MewviErrorBoundary";
import { MewviAvatar } from "@/components/mewvi/MewviAvatar";
import { cn } from "@/lib/utils";

// Pages with a critical action near the bottom of the screen (call 112, "I'm Safe / Get Help",
// the distress prompt). Mewvi shrinks and moves to the top-right there so it can never sit on top of
// those buttons. It is still one tap away.
const CLEAR_BOTTOM_ROUTES = ["/emergency", "/travel/check-in", "/travel/guardian", "/safety/distress-demo", "/location/share"];

export function MewviLauncher() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  // The conversation lives here so it survives page changes while the app stays open.
  const [turns, setTurns] = useState<MewviTurn[]>([]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Return focus to the launcher when the panel closes, so keyboard and screen-reader users are not dropped at the top of the page.
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) launcherRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const clearBottom = CLEAR_BOTTOM_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  return (
    <>
      {open && (
        <MewviErrorBoundary onClose={() => setOpen(false)}>
          <MewviPanel onClose={() => setOpen(false)} turns={turns} setTurns={setTurns} />
        </MewviErrorBoundary>
      )}
      {!open && (
        <button
          ref={launcherRef}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Open Mewvi assistant"
          className={cn(
            "fixed z-40 flex items-center justify-center rounded-full border border-border bg-surface shadow-card transition-all duration-200 ease-calm hover:-translate-y-0.5 hover:shadow-soft-hover active:translate-y-0",
            clearBottom ? "right-3 top-3 p-1 opacity-80 lg:top-20" : "bottom-20 right-4 p-1.5 lg:bottom-6"
          )}
        >
          <MewviAvatar size={clearBottom ? 30 : 40} online />
        </button>
      )}
    </>
  );
}
