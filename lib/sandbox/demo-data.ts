export type SandboxVerdict = "in_scope" | "out_of_scope" | "needs_review";

export type SandboxAlertStatus =
  | "open"
  | "sent_draft"
  | "false_positive"
  | "ignored"
  | "resolved";

export type SandboxSimulationStep =
  | "idle"
  | "message_sent"
  | "retrieving_scope"
  | "classifying"
  | "alert_ready";

export const sandboxWorkspace = Object.freeze({
  id: "sandbox-acme-digital-agency",
  name: "Acme Digital Agency",
  slackTeamName: "Acme Digital Agency Slack",
  tier: "ltd",
  allocatedMonthlyEvents: 1000,
  managedClassifications: 126,
  promptTokens: 84210,
  completionTokens: 11890,
  totalTokens: 96100,
  monthStart: "2026-04-01",
});

export const sandboxProposal = Object.freeze({
  id: "sandbox-clientco-redesign",
  name: "Website Redesign - ClientCo",
  clientName: "ClientCo",
  description:
    "A fixed-scope redesign for ClientCo's marketing site, including discovery, UX, visual design, CMS build, QA, and launch support.",
  effectiveDate: "2026-03-01",
  signedAt: "2026-03-03T15:30:00Z",
});

export const sandboxDocuments = Object.freeze([
  {
    id: "sandbox-clientco-proposal",
    proposalId: sandboxProposal.id,
    parentDocumentId: null,
    kind: "proposal" as const,
    status: "indexed",
    title: "Website Redesign - ClientCo Master Proposal",
    fileName: "clientco-website-redesign-proposal.pdf",
    fileSizeBytes: 428032,
    effectiveDate: "2026-03-01",
    chunkCount: 5,
  },
  {
    id: "sandbox-clientco-addendum",
    proposalId: sandboxProposal.id,
    parentDocumentId: "sandbox-clientco-proposal",
    kind: "addendum" as const,
    status: "indexed",
    title: "Analytics and Launch Support Addendum",
    fileName: "clientco-launch-support-addendum.pdf",
    fileSizeBytes: 118784,
    effectiveDate: "2026-03-18",
    chunkCount: 3,
  },
]);

export const sandboxChunks = Object.freeze([
  {
    id: "sandbox-chunk-001",
    documentId: "sandbox-clientco-proposal",
    sectionTitle: "Included Deliverables",
    chunkIndex: 0,
    tokenCount: 86,
    content:
      "Included scope covers discovery workshops, sitemap, wireframes, visual design, CMS implementation, responsive QA, and production launch for up to 12 marketing pages.",
  },
  {
    id: "sandbox-chunk-002",
    documentId: "sandbox-clientco-proposal",
    sectionTitle: "Content Responsibilities",
    chunkIndex: 1,
    tokenCount: 74,
    content:
      "ClientCo is responsible for final approved copy, image licensing, legal review, and all product photography before CMS entry begins.",
  },
  {
    id: "sandbox-chunk-003",
    documentId: "sandbox-clientco-proposal",
    sectionTitle: "Explicit Exclusions",
    chunkIndex: 2,
    tokenCount: 92,
    content:
      "Brand identity, paid media, CRM implementation, custom ecommerce, and post-launch SEO content production are excluded unless covered by a signed change order.",
  },
  {
    id: "sandbox-chunk-004",
    documentId: "sandbox-clientco-addendum",
    sectionTitle: "Launch Support Addendum",
    chunkIndex: 0,
    tokenCount: 64,
    content:
      "The addendum includes two weeks of launch support, analytics verification, redirects QA, and one executive launch report.",
  },
  {
    id: "sandbox-chunk-005",
    documentId: "sandbox-clientco-addendum",
    sectionTitle: "Analytics Boundary",
    chunkIndex: 1,
    tokenCount: 58,
    content:
      "Analytics work is limited to GA4 validation, dashboard handoff, and event QA. Ongoing conversion-rate analysis is not included.",
  },
]);

export const sandboxChannels = Object.freeze([
  {
    id: "sandbox-channel-project",
    slackChannelId: "C-SANDBOX-PROJECT",
    name: "clientco-redesign",
    isPrivate: false,
    isTracked: true,
    lastSyncedAt: "2026-04-18T09:05:00Z",
  },
  {
    id: "sandbox-channel-launch",
    slackChannelId: "C-SANDBOX-LAUNCH",
    name: "clientco-launch",
    isPrivate: false,
    isTracked: true,
    lastSyncedAt: "2026-04-18T09:05:00Z",
  },
  {
    id: "sandbox-channel-internal",
    slackChannelId: "G-SANDBOX-INTERNAL",
    name: "clientco-internal",
    isPrivate: true,
    isTracked: false,
    lastSyncedAt: "2026-04-18T09:05:00Z",
  },
]);

export const sandboxContacts = Object.freeze([
  {
    id: "sandbox-contact-maya",
    slackUserId: "U-SANDBOX-MAYA",
    displayName: "Maya Patel",
    realName: "Maya Patel",
    email: "maya@clientco.example",
    title: "VP Marketing",
    isActive: true,
  },
  {
    id: "sandbox-contact-eli",
    slackUserId: "U-SANDBOX-ELI",
    displayName: "Eli Stone",
    realName: "Eli Stone",
    email: "eli@clientco.example",
    title: "Digital Lead",
    isActive: true,
  },
  {
    id: "sandbox-contact-nora",
    slackUserId: "U-SANDBOX-NORA",
    displayName: "Nora Kim",
    realName: "Nora Kim",
    email: "nora@clientco.example",
    title: "Product Manager",
    isActive: false,
  },
]);

export const sandboxAlerts = Object.freeze([
  {
    id: "sandbox-alert-paid-media",
    proposalId: sandboxProposal.id,
    channelId: "sandbox-channel-project",
    contactId: "sandbox-contact-maya",
    clientMessage:
      "Can your team set up our LinkedIn ad campaigns and manage the launch budget next week?",
    threadContext:
      "Maya Patel: Can your team set up our LinkedIn ad campaigns and manage the launch budget next week?\nProject Manager: Checking the contract scope now.",
    verdict: "out_of_scope" as SandboxVerdict,
    confidence: 0.96,
    reason:
      "Paid media setup and campaign management are explicitly excluded from the signed proposal.",
    matchedSection: "Explicit Exclusions",
    matchedChunkIds: ["sandbox-chunk-003"],
    status: "open" as SandboxAlertStatus,
    slackChannelId: "C-SANDBOX-PROJECT",
    slackMessageTs: "1776504300.000100",
    createdAt: "2026-04-18T09:25:00Z",
  },
  {
    id: "sandbox-alert-crm",
    proposalId: sandboxProposal.id,
    channelId: "sandbox-channel-project",
    contactId: "sandbox-contact-eli",
    clientMessage:
      "Could you connect the new forms to Salesforce and map the lifecycle stages while you are in there?",
    threadContext:
      "Eli Stone: Could you connect the new forms to Salesforce and map the lifecycle stages while you are in there?",
    verdict: "out_of_scope" as SandboxVerdict,
    confidence: 0.91,
    reason:
      "CRM implementation is listed as an exclusion and would need a change order.",
    matchedSection: "Explicit Exclusions",
    matchedChunkIds: ["sandbox-chunk-003"],
    status: "sent_draft" as SandboxAlertStatus,
    slackChannelId: "C-SANDBOX-PROJECT",
    slackMessageTs: "1776505200.000200",
    createdAt: "2026-04-18T09:40:00Z",
  },
  {
    id: "sandbox-alert-seo",
    proposalId: sandboxProposal.id,
    channelId: "sandbox-channel-launch",
    contactId: "sandbox-contact-maya",
    clientMessage:
      "Please write four new SEO landing pages for the campaign before launch.",
    threadContext:
      "Maya Patel: Please write four new SEO landing pages for the campaign before launch.",
    verdict: "out_of_scope" as SandboxVerdict,
    confidence: 0.88,
    reason:
      "Post-launch SEO content production is excluded unless covered by a signed change order.",
    matchedSection: "Explicit Exclusions",
    matchedChunkIds: ["sandbox-chunk-003"],
    status: "open" as SandboxAlertStatus,
    slackChannelId: "C-SANDBOX-LAUNCH",
    slackMessageTs: "1776506100.000300",
    createdAt: "2026-04-18T09:55:00Z",
  },
  {
    id: "sandbox-alert-redirects",
    proposalId: sandboxProposal.id,
    channelId: "sandbox-channel-launch",
    contactId: "sandbox-contact-eli",
    clientMessage:
      "Can you confirm the redirects and analytics events before we publish the new site?",
    threadContext:
      "Eli Stone: Can you confirm the redirects and analytics events before we publish the new site?",
    verdict: "in_scope" as SandboxVerdict,
    confidence: 0.93,
    reason:
      "Redirect QA and analytics verification are included in the launch support addendum.",
    matchedSection: "Launch Support Addendum",
    matchedChunkIds: ["sandbox-chunk-004", "sandbox-chunk-005"],
    status: "resolved" as SandboxAlertStatus,
    slackChannelId: "C-SANDBOX-LAUNCH",
    slackMessageTs: "1776507000.000400",
    createdAt: "2026-04-18T10:10:00Z",
  },
  {
    id: "sandbox-alert-cro",
    proposalId: sandboxProposal.id,
    channelId: "sandbox-channel-launch",
    contactId: "sandbox-contact-nora",
    clientMessage:
      "After launch, can you analyze which homepage variant converts better and recommend copy changes?",
    threadContext:
      "Nora Kim: After launch, can you analyze which homepage variant converts better and recommend copy changes?",
    verdict: "needs_review" as SandboxVerdict,
    confidence: 0.67,
    reason:
      "Analytics verification is included, but ongoing conversion-rate analysis is outside the stated analytics boundary.",
    matchedSection: "Analytics Boundary",
    matchedChunkIds: ["sandbox-chunk-005"],
    status: "open" as SandboxAlertStatus,
    slackChannelId: "C-SANDBOX-LAUNCH",
    slackMessageTs: "1776507900.000500",
    createdAt: "2026-04-18T10:25:00Z",
  },
]);

export const sandboxSimulationMessages = Object.freeze([
  {
    id: "sandbox-chat-001",
    sender: "Account Manager",
    role: "agency" as const,
    text: "Maya, the launch checklist is looking healthy. We are validating redirects and GA4 events today.",
    timestamp: "10:31 AM",
  },
  {
    id: "sandbox-chat-002",
    sender: "Maya Patel",
    role: "client" as const,
    text: "Great, thank you. The site preview looks good on our side.",
    timestamp: "10:33 AM",
  },
  {
    id: "sandbox-chat-003",
    sender: "Account Manager",
    role: "agency" as const,
    text: "Perfect. Send anything launch-related here and ScopeSignal will keep an eye on the agreement.",
    timestamp: "10:34 AM",
  },
]);

export const sandboxSimulationScenarios = Object.freeze([
  {
    id: "sim-paid-media",
    label: "Ask for ad campaign setup",
    channelId: "sandbox-channel-project",
    contactId: "sandbox-contact-maya",
    buttonText: "Send paid media request",
    clientMessage:
      "Can your team set up our LinkedIn ad campaigns and manage the launch budget next week?",
    generatedReply:
      "Heads up: paid media is outside the signed website redesign scope. I can draft a change-order note for the team.",
    alert: {
      id: "sandbox-live-alert-paid-media",
      proposalId: sandboxProposal.id,
      channelId: "sandbox-channel-project",
      contactId: "sandbox-contact-maya",
      clientMessage:
        "Can your team set up our LinkedIn ad campaigns and manage the launch budget next week?",
      threadContext:
        "Maya Patel: Can your team set up our LinkedIn ad campaigns and manage the launch budget next week?\nAccount Manager: Checking the contract scope now.",
      verdict: "out_of_scope" as SandboxVerdict,
      confidence: 0.96,
      reason:
        "Paid media setup and campaign management are explicitly excluded from the signed proposal.",
      matchedSection: "Explicit Exclusions",
      matchedChunkIds: ["sandbox-chunk-003"],
      status: "open" as SandboxAlertStatus,
      slackChannelId: "C-SANDBOX-PROJECT",
      slackMessageTs: "sandbox-live-001",
      createdAt: "2026-04-18T10:35:00Z",
    },
  },
  {
    id: "sim-analytics",
    label: "Ask for launch QA",
    channelId: "sandbox-channel-launch",
    contactId: "sandbox-contact-eli",
    buttonText: "Send launch QA request",
    clientMessage:
      "Can you confirm the redirects and analytics events before we publish the new site?",
    generatedReply:
      "This looks covered by the launch support addendum. No scope alert is needed.",
    alert: {
      id: "sandbox-live-alert-analytics",
      proposalId: sandboxProposal.id,
      channelId: "sandbox-channel-launch",
      contactId: "sandbox-contact-eli",
      clientMessage:
        "Can you confirm the redirects and analytics events before we publish the new site?",
      threadContext:
        "Eli Stone: Can you confirm the redirects and analytics events before we publish the new site?",
      verdict: "in_scope" as SandboxVerdict,
      confidence: 0.93,
      reason:
        "Redirect QA and analytics verification are included in the launch support addendum.",
      matchedSection: "Launch Support Addendum",
      matchedChunkIds: ["sandbox-chunk-004", "sandbox-chunk-005"],
      status: "resolved" as SandboxAlertStatus,
      slackChannelId: "C-SANDBOX-LAUNCH",
      slackMessageTs: "sandbox-live-002",
      createdAt: "2026-04-18T10:36:00Z",
    },
  },
  {
    id: "sim-cro",
    label: "Ask for conversion analysis",
    channelId: "sandbox-channel-launch",
    contactId: "sandbox-contact-nora",
    buttonText: "Send CRO request",
    clientMessage:
      "After launch, can you analyze which homepage variant converts better and recommend copy changes?",
    generatedReply:
      "This one is close enough to need a human review. Analytics validation is included, but ongoing CRO analysis is not.",
    alert: {
      id: "sandbox-live-alert-cro",
      proposalId: sandboxProposal.id,
      channelId: "sandbox-channel-launch",
      contactId: "sandbox-contact-nora",
      clientMessage:
        "After launch, can you analyze which homepage variant converts better and recommend copy changes?",
      threadContext:
        "Nora Kim: After launch, can you analyze which homepage variant converts better and recommend copy changes?",
      verdict: "needs_review" as SandboxVerdict,
      confidence: 0.67,
      reason:
        "Analytics verification is included, but ongoing conversion-rate analysis is outside the stated analytics boundary.",
      matchedSection: "Analytics Boundary",
      matchedChunkIds: ["sandbox-chunk-005"],
      status: "open" as SandboxAlertStatus,
      slackChannelId: "C-SANDBOX-LAUNCH",
      slackMessageTs: "sandbox-live-003",
      createdAt: "2026-04-18T10:37:00Z",
    },
  },
]);
