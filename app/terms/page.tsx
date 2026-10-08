import type { Metadata } from "next";
import { LegalPage } from "@/app/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service | ScopeSignal",
  description:
    "The baseline terms for evaluating and using ScopeSignal.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Terms of Service"
      updatedAt="April 21, 2026"
      intro="These terms outline the baseline expectations for access to ScopeSignal, including acceptable use, ownership, and service limitations."
      sections={[
        {
          title: "Use of the service",
          body: (
            <>
              <p>
                ScopeSignal is provided for business use by agencies and service
                teams that want to compare client requests against contract
                scope. You are responsible for how your workspace configures
                Slack monitoring, document uploads, and recipient notifications.
              </p>
              <p>
                You may not use the service for unlawful activity, abusive
                automation, or any purpose that violates the rights of others.
              </p>
            </>
          ),
        },
        {
          title: "Customer content",
          body: (
            <>
              <p>
                You retain ownership of the proposals, addendums, workspace
                metadata, and message content you submit to ScopeSignal. You are
                responsible for ensuring you have the rights and permissions
                needed to upload or process that content.
              </p>
              <p>
                By using the service, you grant ScopeSignal the limited rights
                needed to host, process, and analyze that content to provide the
                product features you enable.
              </p>
            </>
          ),
        },
        {
          title: "Availability and limitations",
          body: (
            <>
              <p>
                ScopeSignal depends on third-party infrastructure and APIs,
                including Slack, Supabase, OpenAI, and Resend. Service behavior
                may be affected by outages, rate limits, or policy changes from
                those providers.
              </p>
              <p>
                AI-generated classifications are decision-support tools and may
                require human review, especially in ambiguous or high-stakes
                situations.
              </p>
            </>
          ),
        },
        {
          title: "Plans, billing, and support",
          body: (
            <>
              <p>
                Usage limits, lifetime plan entitlements, and BYOK behavior are
                defined by the plan associated with your workspace. If a feature
                is marked as planned or preview, it may change before general
                availability.
              </p>
              <p>
                Additional commercial terms, refunds, and support commitments
                may be described in your checkout flow or a
                separate written agreement.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
