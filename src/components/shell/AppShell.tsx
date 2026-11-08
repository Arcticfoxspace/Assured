import { Header } from "@/components/shell/Header";
import { MobileNav } from "@/components/shell/MobileNav";
import { Footer } from "@/components/shell/Footer";
import { MewviLauncher } from "@/components/mewvi/MewviLauncher";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded focus:border focus:border-border focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-card"
      >
        Skip to main content
      </a>
      <Header />
      <main id="main-content" tabIndex={-1} className="flex-1 pb-24 focus:outline-none lg:pb-0">
        {children}
      </main>
      <Footer />
      <MobileNav />
      <MewviLauncher />
    </div>
  );
}
