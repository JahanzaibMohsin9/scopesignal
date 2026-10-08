import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  FileText,
  Lock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Star,
  Upload,
  Zap,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export const metadata: Metadata = {
  title: "ScopeSignal - AI Scope Monitoring for Agencies",
  description:
    "Stop scope creep before it costs you. ScopeSignal compares client Slack messages against your signed proposal and alerts your team in real time.",
  openGraph: {
    title: "ScopeSignal - AI Scope Monitoring for Agencies",
    description:
      "ScopeSignal helps agencies catch out-of-scope client requests before they turn into margin loss.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ScopeSignal - AI Scope Monitoring for Agencies",
    description:
      "Catch scope creep early with contract-aware Slack alerts for agency teams.",
  },
};

const howItWorksSteps = [
  {
    number: "01",
    title: "Upload your proposal",
    description:
      "Add your signed proposal and any addendums so ScopeSignal can understand the real contract scope your team is operating under.",
    icon: Upload,
  },
  {
    number: "02",
    title: "Connect Slack",
    description:
      "Choose the channels and client contacts you want monitored. ScopeSignal only watches the conversations your workspace explicitly enables.",
    icon: MessageSquare,
  },
  {
    number: "03",
    title: "Get contract-aware alerts",
    description:
      "When a request falls outside the signed scope, your team gets an alert with the matched clause, confidence level, and a fast triage path.",
    icon: Bell,
  },
];

const featureCards = [
  {
    title: "AI Classification",
    description:
      "Each client request is classified as in scope, out of scope, or needs review with structured reasoning and evidence.",
    icon: Zap,
    tag: "Core",
  },
  {
    title: "Contract Awareness",
    description:
      "Base proposals and newer addendums are considered together, so the latest signed terms can override older wording.",
    icon: FileText,
    tag: "Smart",
  },
  {
    title: "Slack-Native Alerts",
    description:
      "Alerts arrive where account managers already work, with quick actions for draft approval, ignore, and false-positive feedback.",
    icon: Bell,
    tag: "Fast",
  },
  {
    title: "Usage Controls",
    description:
      "Managed quotas, BYOK support, and visibility into monthly usage help you scale the product without surprises.",
    icon: ShieldCheck,
    tag: "Practical",
  },
];

const testimonials = [
  {
    quote:
      "We need a way to spot out-of-scope asks before they turn into awkward invoice conversations or burned margin.",
    author: "Agency operations teams",
    role: "Common pain point before rollout",
  },
  {
    quote:
      "Our contracts evolve, so the alerting has to understand addendums and updated terms instead of treating every proposal like a static PDF.",
    author: "Client service leads",
    role: "What teams ask for in evaluation",
  },
  {
    quote:
      "The best-case scenario is catching scope drift early enough that the team can reset expectations before extra work quietly lands on delivery.",
    author: "Agency founders",
    role: "Desired outcome from a tool like ScopeSignal",
  },
];

const pricingTiers = [
  {
    name: "Starter",
    price: "$49",
    period: "one-time",
    quota: "200 classifications / month",
    description: "A simple entry point for solo consultants and smaller teams.",
    badge: null,
    highlighted: false,
    cta: "Create Account",
    href: "/auth/sign-up",
    features: [
      "1 Slack workspace",
      "Proposal and addendum uploads",
      "Slack and email alerts",
      "Alert triage dashboard",
      "Monthly usage tracking",
    ],
  },
  {
    name: "Growth",
    price: "$99",
    period: "one-time",
    quota: "500 classifications / month",
    description:
      "Built for agencies managing more clients and more active Slack traffic.",
    badge: "Most Popular",
    highlighted: true,
    cta: "Create Account",
    href: "/auth/sign-up",
    features: [
      "Everything in Starter",
      "Higher managed monthly quota",
      "Advanced retrieval tracing",
      "False-positive feedback dashboard",
      "Priority support",
    ],
  },
  {
    name: "Agency",
    price: "$199",
    period: "one-time",
    quota: "1,000 classifications / month",
    description:
      "For high-volume teams that want maximum flexibility and headroom.",
    badge: "BYOK Ready",
    highlighted: false,
    cta: "Create Account",
    href: "/auth/sign-up",
    features: [
      "Everything in Growth",
      "Bring Your Own OpenAI key",
      "BYOK processing beyond managed quota",
      "1 Slack workspace",
      "Early access to new features",
    ],
  },
];

function SectionEyebrow({ children }: { children: string }) {
  return (
    <div className="mb-4 flex justify-center">
      <span className="landing-eyebrow">
        {children}
      </span>
    </div>
  );
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: ReactNode;
  subtitle: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <h2 className="landing-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      <p className="landing-subheading mt-4 text-sm leading-7 sm:text-base">
        {subtitle}
      </p>
    </div>
  );
}

function LandingNav() {
  return (
    <header className="landing-nav-shell sticky top-0 z-50 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="landing-logo-badge flex h-9 w-9 items-center justify-center rounded-xl">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
          <span className="landing-brand text-sm font-semibold tracking-wide sm:text-base">
            ScopeSignal
          </span>
        </Link>

        <nav className="landing-nav-list hidden items-center gap-8 text-sm md:flex">
          <a href="#how-it-works" className="landing-nav-link transition">
            How it works
          </a>
          <a href="#features" className="landing-nav-link transition">
            Features
          </a>
          <a href="#pricing" className="landing-nav-link transition">
            Pricing
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle compact />
          <Link
            href="/auth/sign-in"
            className="landing-secondary-button hidden rounded-full px-4 py-2 text-sm font-medium transition sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/auth/sign-up"
            className="landing-primary-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:opacity-95"
          >
            Get Started Free
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-20 sm:pb-28 sm:pt-24">
      <div className="landing-orb landing-orb-one" />
      <div className="landing-orb landing-orb-two" />
      <div className="landing-orb landing-orb-three" />

      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-4xl text-center">
          <div className="landing-hero-pill mb-7 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            Built for agency teams and launch-ready onboarding
          </div>

          <h1 className="landing-hero-title text-4xl font-semibold tracking-tight sm:text-6xl">
            Stop scope creep{" "}
            <span className="bg-[linear-gradient(135deg,oklch(0.82_0.13_168),oklch(0.74_0.17_150))] bg-clip-text text-transparent">
              before it costs you
            </span>
          </h1>

          <p className="landing-copy mx-auto mt-6 max-w-2xl text-base leading-8 sm:text-lg">
            ScopeSignal reads your signed proposals, watches the Slack
            conversations you approve, and flags out-of-scope requests before
            they turn into margin leaks.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/auth/sign-up"
              className="landing-primary-button inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition hover:-translate-y-0.5 hover:opacity-95"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/sandbox"
              className="landing-secondary-button inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition"
            >
              Try the Sandbox Demo
            </Link>
          </div>

          <p className="landing-caption mt-5 text-sm">
            No credit card required. Works with your existing Slack workspace.
          </p>
        </div>

        <div className="landing-hero-preview mx-auto mt-16 max-w-3xl rounded-[28px] p-5 backdrop-blur">
          <div className="mb-5 flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#28ca41]" />
            <span className="landing-caption ml-2 text-xs font-medium">
              ScopeSignal - Slack alert preview
            </span>
          </div>

          <div className="landing-preview-body rounded-2xl p-5">
            <div className="flex gap-4">
              <div className="landing-logo-badge flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                <ShieldCheck className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="landing-strong-text text-sm font-semibold">
                  Scope Alert - Out of Contract
                </div>
                <p className="landing-preview-note mt-3 rounded-xl px-4 py-3 text-sm leading-7">
                  <span className="landing-accent-text font-semibold">
                    ClientCo:
                  </span>{" "}
                  &ldquo;Can you also add a mobile app version of the dashboard
                  before launch?&rdquo;
                </p>
                <p className="landing-copy mt-3 text-sm leading-7">
                  <span className="landing-accent-text font-semibold">
                    Matched clause:
                  </span>{" "}
                  Website Redesign Proposal Section 3.1 - Deliverables
                  (web-only scope, no mobile build included)
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {["Approve Draft", "False Positive", "Ignore"].map((label) => (
                    <span
                      key={label}
                      className="landing-chip rounded-lg px-3 py-1.5 text-xs font-medium"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <span className="landing-caption w-20 text-xs">
                Confidence
              </span>
              <div className="landing-progress-track h-2 flex-1 overflow-hidden rounded-full">
                <div className="h-full w-[92%] rounded-full bg-[linear-gradient(90deg,oklch(0.66_0.16_175),oklch(0.74_0.17_150))]" />
              </div>
              <span className="landing-accent-text text-xs font-semibold">
                92%
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="landing-section px-6 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl">
        <SectionEyebrow>How it works</SectionEyebrow>
        <SectionHeading
          title={
            <>
              From proposal to alert in{" "}
              <span className="bg-[linear-gradient(135deg,oklch(0.82_0.13_168),oklch(0.74_0.17_150))] bg-clip-text text-transparent">
                three steps
              </span>
            </>
          }
          subtitle="ScopeSignal is designed for agency teams that want clear setup, fast proof of value, and minimal operational overhead."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {howItWorksSteps.map((step, index) => {
            const Icon = step.icon;

            return (
              <div
                key={step.number}
                className="landing-card relative rounded-[24px] p-7"
              >
                {index < howItWorksSteps.length - 1 ? (
                  <div className="landing-accent-text absolute -right-3 top-1/2 hidden -translate-y-1/2 lg:block">
                    <ChevronRight className="h-5 w-5" />
                  </div>
                ) : null}

                <div className="landing-accent-text text-xs font-semibold tracking-[0.24em]">
                  {step.number}
                </div>
                <div className="landing-icon-shell mt-5 flex h-12 w-12 items-center justify-center rounded-2xl">
                  <Icon className="landing-accent-text h-5 w-5" />
                </div>
                <h3 className="landing-strong-text mt-5 text-xl font-semibold">
                  {step.title}
                </h3>
                <p className="landing-copy mt-3 text-sm leading-7">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section
      id="features"
      className="landing-section px-6 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl">
        <SectionEyebrow>Features</SectionEyebrow>
        <SectionHeading
          title={
            <>
              Built for agencies that want{" "}
              <span className="bg-[linear-gradient(135deg,oklch(0.82_0.13_168),oklch(0.74_0.17_150))] bg-clip-text text-transparent">
                margin protection
              </span>
            </>
          }
          subtitle="The core workflow is deliberately simple: understand the contract, monitor approved conversations, and surface risk before work gets absorbed."
        />

        <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {featureCards.map((feature) => {
            const Icon = feature.icon;

            return (
              <div
                key={feature.title}
                className="landing-card rounded-[24px] p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="landing-icon-shell flex h-11 w-11 items-center justify-center rounded-2xl">
                    <Icon className="landing-accent-text h-5 w-5" />
                  </div>
                  <span className="landing-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
                    {feature.tag}
                  </span>
                </div>
                <h3 className="landing-strong-text mt-5 text-lg font-semibold">
                  {feature.title}
                </h3>
                <p className="landing-copy mt-3 text-sm leading-7">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SocialProofSection() {
  return (
    <section className="landing-section landing-section-alt px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <SectionEyebrow>What teams need</SectionEyebrow>
        <SectionHeading
          title={
            <>
              What agency teams say they need to protect{" "}
              <span className="bg-[linear-gradient(135deg,oklch(0.82_0.13_168),oklch(0.74_0.17_150))] bg-clip-text text-transparent">
                scope and margins
              </span>
            </>
          }
          subtitle="These are representative themes from agency discovery conversations and common pre-purchase concerns, not attributed customer testimonials."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.author}
              className="landing-card rounded-[24px] p-6"
            >
              <div className="mb-4 flex gap-1">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star
                    key={index}
                    className="landing-accent-text h-4 w-4 fill-current"
                  />
                ))}
              </div>
              <p className="landing-copy text-sm leading-7">
                &ldquo;{testimonial.quote}&rdquo;
              </p>
              <div className="mt-6">
                <div className="landing-strong-text text-sm font-semibold">
                  {testimonial.author}
                </div>
                <div className="landing-caption mt-1 text-xs">
                  {testimonial.role}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="landing-caption mt-10 flex flex-wrap items-center justify-center gap-3 text-xs">
          <span>Built with:</span>
          {["Next.js 16", "Supabase", "pgvector", "OpenAI", "Slack API", "Resend"].map(
            (item) => (
              <span
                key={item}
                className="landing-chip rounded-full px-3 py-1.5"
              >
                {item}
              </span>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section
      id="pricing"
      className="landing-section px-6 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl">
        <SectionEyebrow>Pricing</SectionEyebrow>
        <SectionHeading
          title={
            <>
              Lifetime plans{" "}
              <span className="bg-[linear-gradient(135deg,oklch(0.82_0.13_168),oklch(0.74_0.17_150))] bg-clip-text text-transparent">
                with clear usage limits
              </span>
            </>
          }
          subtitle="Each code activates a fixed monthly managed classification quota. Higher-volume teams can add their own OpenAI key for usage beyond the managed allowance."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {pricingTiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-[26px] p-7 ${
                tier.highlighted
                  ? "landing-card-highlight"
                  : "landing-card"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="landing-copy text-sm font-semibold">
                    {tier.name}
                  </div>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="landing-strong-text text-4xl font-semibold tracking-tight">
                      {tier.price}
                    </span>
                    <span className="landing-caption pb-1 text-sm">
                      {tier.period}
                    </span>
                  </div>
                </div>
                {tier.badge ? (
                  <span className="landing-chip landing-accent-text rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
                    {tier.badge}
                  </span>
                ) : null}
              </div>

              <div className="landing-chip landing-accent-text mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold">
                {tier.quota}
              </div>

              <p className="landing-copy mt-4 text-sm leading-7">
                {tier.description}
              </p>

              <ul className="mt-6 space-y-3">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="landing-copy flex items-start gap-3 text-sm leading-6"
                  >
                    <CheckCircle2 className="landing-accent-text mt-0.5 h-4 w-4 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={tier.href}
                className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${
                  tier.highlighted
                    ? "landing-primary-button hover:-translate-y-0.5 hover:opacity-95"
                    : "landing-secondary-button"
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="landing-caption mt-8 text-center text-sm">
          Redeem your code from Settings after creating a workspace. Codes
          attach to one workspace and managed AI usage is capped by tier.
        </p>
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section className="px-6 py-20 sm:py-24">
      <div className="landing-cta-shell mx-auto max-w-4xl rounded-[32px] px-8 py-12 text-center sm:px-12">
        <div className="landing-hero-pill mb-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold">
          <Lock className="h-3.5 w-3.5" />
          Free sandbox - no sign-up required
        </div>
        <h2 className="landing-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          See the alert flow before you commit
        </h2>
        <p className="landing-copy mx-auto mt-4 max-w-2xl text-sm leading-7 sm:text-base">
          Try the interactive sandbox with a preloaded agency scenario, watch
          the alert appear, and understand the value proposition in under a
          minute.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/sandbox"
            className="landing-primary-button inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition hover:-translate-y-0.5 hover:opacity-95"
          >
            Try the Sandbox Demo
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/auth/sign-up"
            className="landing-secondary-button inline-flex items-center rounded-full px-6 py-3 text-sm font-semibold transition"
          >
            Create Free Account
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="landing-footer px-6 py-10">
      <div className="landing-caption mx-auto flex max-w-6xl flex-col gap-5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="landing-logo-badge flex h-8 w-8 items-center justify-center rounded-xl">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
          <span className="landing-brand font-semibold">ScopeSignal</span>
        </div>

        <nav className="flex flex-wrap gap-5">
          {[
            { label: "Sign In", href: "/auth/sign-in" },
            { label: "Sign Up", href: "/auth/sign-up" },
            { label: "Sandbox", href: "/sandbox" },
            { label: "Privacy", href: "/privacy" },
            { label: "Terms", href: "/terms" },
          ].map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="landing-nav-link transition"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p>Copyright {new Date().getFullYear()} ScopeSignal.</p>
      </div>
    </footer>
  );
}

const rootStyle: CSSProperties = {
  minHeight: "100vh",
  backgroundColor: "var(--landing-bg)",
  color: "var(--landing-text)",
};

export default function LandingPage() {
  return (
    <>
      <style>{`
        html {
          scroll-behavior: smooth;
        }

        .landing-root {
          --landing-bg: oklch(0.1 0.025 240);
          --landing-surface: oklch(0.12 0.025 240 / 0.96);
          --landing-surface-soft: oklch(0.085 0.02 240 / 0.75);
          --landing-surface-strong: oklch(0.08 0.02 240);
          --landing-border: oklch(1 0 0 / 0.1);
          --landing-border-strong: oklch(0.66 0.16 175 / 0.26);
          --landing-text: oklch(0.92 0.02 220);
          --landing-text-strong: oklch(1 0 0);
          --landing-text-muted: oklch(0.68 0.03 225);
          --landing-text-soft: oklch(0.55 0.025 230);
          --landing-chip-bg: oklch(1 0 0 / 0.05);
          --landing-preview-note: oklch(0 0 0 / 0.1);
          --landing-shadow: 0 25px 80px oklch(0 0 0 / 0.38);
          --landing-card-shadow: 0 20px 45px oklch(0 0 0 / 0.24);
          --landing-highlight-shadow: 0 0 48px oklch(0.66 0.16 175 / 0.16);
          --landing-cta-shadow: 0 0 70px oklch(0.66 0.16 175 / 0.12);
        }

        html[data-theme="light"] .landing-root {
          --landing-bg: oklch(0.985 0.006 220);
          --landing-surface: oklch(0.995 0.002 220 / 0.98);
          --landing-surface-soft: oklch(0.96 0.012 220 / 0.92);
          --landing-surface-strong: oklch(0.985 0.004 220);
          --landing-border: oklch(0.85 0.012 230 / 0.8);
          --landing-border-strong: oklch(0.57 0.16 176 / 0.22);
          --landing-text: oklch(0.24 0.03 244);
          --landing-text-strong: oklch(0.16 0.02 244);
          --landing-text-muted: oklch(0.4 0.03 240);
          --landing-text-soft: oklch(0.5 0.03 240);
          --landing-chip-bg: oklch(0.94 0.012 225 / 0.8);
          --landing-preview-note: oklch(0.94 0.012 225 / 0.7);
          --landing-shadow: 0 25px 80px oklch(0.57 0.04 230 / 0.12);
          --landing-card-shadow: 0 20px 45px oklch(0.57 0.04 230 / 0.12);
          --landing-highlight-shadow: 0 0 48px oklch(0.57 0.16 176 / 0.14);
          --landing-cta-shadow: 0 0 70px oklch(0.57 0.16 176 / 0.1);
        }

        .landing-root {
          position: relative;
          overflow: hidden;
        }

        .landing-root * {
          box-sizing: border-box;
        }

        .landing-orb {
          pointer-events: none;
          position: absolute;
          border-radius: 999px;
          filter: blur(6px);
        }

        .landing-orb-one {
          top: -6rem;
          left: 50%;
          height: 28rem;
          width: 28rem;
          transform: translateX(-50%);
          background: radial-gradient(circle, oklch(0.66 0.16 175 / 0.22) 0%, transparent 68%);
        }

        .landing-orb-two {
          top: 18rem;
          left: 6%;
          height: 18rem;
          width: 18rem;
          background: radial-gradient(circle, oklch(0.74 0.17 150 / 0.14) 0%, transparent 70%);
        }

        .landing-orb-three {
          top: 10rem;
          right: 8%;
          height: 16rem;
          width: 16rem;
          background: radial-gradient(circle, oklch(0.66 0.16 175 / 0.12) 0%, transparent 70%);
        }

        .landing-nav-shell,
        .landing-section,
        .landing-footer {
          border-color: var(--landing-border);
        }

        .landing-nav-shell {
          border-bottom-width: 1px;
          background: color-mix(in oklab, var(--landing-bg) 86%, transparent);
        }

        .landing-section {
          border-top-width: 1px;
        }

        .landing-section-alt {
          background: var(--landing-surface-soft);
        }

        .landing-footer {
          border-top-width: 1px;
        }

        .landing-logo-badge,
        .landing-primary-button {
          background: linear-gradient(135deg, oklch(0.66 0.16 175), oklch(0.74 0.17 150));
          box-shadow: 0 0 28px oklch(0.66 0.16 175 / 0.22);
          color: white;
        }

        .landing-primary-button * {
          color: inherit;
        }

        .landing-secondary-button {
          border: 1px solid var(--landing-border);
          color: var(--landing-text-muted);
        }

        .landing-secondary-button:hover,
        .landing-nav-link:hover {
          border-color: var(--landing-border-strong);
          color: var(--landing-text-strong);
        }

        .landing-brand,
        .landing-heading,
        .landing-hero-title,
        .landing-strong-text {
          color: var(--landing-text-strong);
        }

        .landing-nav-list,
        .landing-copy,
        .landing-subheading {
          color: var(--landing-text-muted);
        }

        .landing-caption {
          color: var(--landing-text-soft);
        }

        .landing-eyebrow,
        .landing-hero-pill,
        .landing-accent-text {
          color: var(--color-accent);
        }

        .landing-eyebrow,
        .landing-hero-pill,
        .landing-icon-shell {
          border: 1px solid var(--landing-border-strong);
          background: color-mix(in oklab, var(--color-accent) 10%, transparent);
        }

        .landing-hero-preview,
        .landing-card,
        .landing-card-highlight,
        .landing-cta-shell {
          border: 1px solid var(--landing-border);
          background: var(--landing-surface);
          box-shadow: var(--landing-shadow);
        }

        .landing-preview-body {
          border: 1px solid color-mix(in oklab, var(--landing-border) 80%, transparent);
          background: var(--landing-surface-strong);
        }

        .landing-preview-note,
        .landing-chip {
          border: 1px solid color-mix(in oklab, var(--landing-border) 80%, transparent);
          background: var(--landing-chip-bg);
          color: var(--landing-text-muted);
        }

        .landing-progress-track {
          background: color-mix(in oklab, var(--landing-border) 80%, transparent);
        }

        .landing-card-highlight {
          border-color: color-mix(in oklab, var(--color-accent) 55%, transparent);
          box-shadow: var(--landing-highlight-shadow);
        }

        .landing-cta-shell {
          border-color: var(--landing-border-strong);
          box-shadow: var(--landing-cta-shadow);
        }

        .landing-card {
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }

        .landing-card:hover {
          transform: translateY(-3px);
          border-color: color-mix(in oklab, var(--color-accent) 40%, transparent);
          box-shadow: var(--landing-card-shadow);
        }
      `}</style>

      <div className="landing-root" style={rootStyle}>
        <LandingNav />
        <HeroSection />
        <HowItWorksSection />
        <FeaturesSection />
        <SocialProofSection />
        <PricingSection />
        <FinalCtaSection />
        <Footer />
      </div>
    </>
  );
}
