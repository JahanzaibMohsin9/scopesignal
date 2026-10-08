import type { Metadata } from "next";
import { LegalPage } from "@/app/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | ScopeSignal",
  description:
    "How ScopeSignal collects, uses, and protects information for agencies using the platform.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy Policy"
      updatedAt="April 21, 2026"
      intro="This page explains what information ScopeSignal processes, why we process it, and the controls available to agencies evaluating or using the product."
      sections={[
        {
          title: "Information we process",
          body: (
            <>
              <p>
                ScopeSignal processes workspace account information, Slack
                connection metadata, proposal documents you upload, and alert
                records generated from monitored client messages. We also keep
                operational logs needed for debugging, quota tracking, and
                service security.
              </p>
              <p>
                When enabled by your workspace, ScopeSignal may send email
                notifications using Resend. We only use recipient details needed
                to deliver those notices.
              </p>
            </>
          ),
        },
        {
          title: "How we use data",
          body: (
            <>
              <p>
                We use the data you provide to compare client requests against
                uploaded contract scope, deliver alerts, support onboarding, and
                improve service reliability. We also use limited analytics and
                operational telemetry to understand product usage and detect
                abuse.
              </p>
              <p>
                ScopeSignal is designed to monitor only the Slack channels and
                client contacts your workspace explicitly selects.
              </p>
            </>
          ),
        },
        {
          title: "Data retention and security",
          body: (
            <>
              <p>
                Proposal and alert data are stored in your configured Supabase
                project with workspace-level access controls. API keys and other
                secrets are stored using encrypted secret-management flows when
                available.
              </p>
              <p>
                We recommend that customers avoid uploading documents that are
                outside the intended business use of the platform or that exceed
                their internal compliance policies.
              </p>
            </>
          ),
        },
        {
          title: "Your choices",
          body: (
            <>
              <p>
                Workspace administrators control which channels are monitored,
                which contacts are active, whether email alerts are enabled, and
                whether a BYOK OpenAI key is configured.
              </p>
              <p>
                If you have questions about privacy, deletion, or data handling,
                contact your workspace administrator or the ScopeSignal team
                before using the service in production.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
