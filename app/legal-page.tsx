import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";

type LegalPageProps = {
  eyebrow: string;
  title: string;
  updatedAt: string;
  intro: string;
  sections: Array<{
    title: string;
    body: ReactNode;
  }>;
};

export function LegalPage({
  eyebrow,
  title,
  updatedAt,
  intro,
  sections,
}: LegalPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-10 sm:px-8">
        <div className="mb-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to ScopeSignal
            </Link>

            <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              <ShieldCheck className="h-3.5 w-3.5" />
              {eyebrow}
            </div>
          </div>

          <ThemeToggle compact />
        </div>

        <article className="rounded-3xl border border-border/70 bg-card/95 p-8 shadow-[0_30px_80px_color-mix(in_oklab,var(--foreground)_18%,transparent)] backdrop-blur sm:p-10">
          <header className="border-b border-border/70 pb-8">
            <p className="text-sm font-medium text-muted-foreground">
              Last updated {updatedAt}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              {intro}
            </p>
          </header>

          <div className="mt-8 space-y-8">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-semibold text-foreground">
                  {section.title}
                </h2>
                <div className="mt-3 space-y-4 text-sm leading-7 text-muted-foreground">
                  {section.body}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
