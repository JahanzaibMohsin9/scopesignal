import type { ClassificationInput } from "@/lib/openai/classification";

export type ClassificationEvaluationScenario = {
  id: string;
  name: string;
  category: "clear_in_scope" | "clear_out_of_scope";
  input: ClassificationInput;
  expected: {
    verdict: "in_scope" | "out_of_scope";
    needsHumanReview: false;
    matchedChunkId: string;
    minConfidence: number;
  };
};

const baseInput = {
  workspaceId: "workspace-day31",
  threadContext:
    "The client is asking whether the agency can handle this before launch.",
};

export const classificationEvaluationScenarios: ClassificationEvaluationScenario[] =
  [
    {
      id: "in-scope-analytics-review",
      name: "includes monthly analytics review",
      category: "clear_in_scope",
      input: {
        ...baseInput,
        clientMessage: "Can you include this month's analytics review?",
        chunks: [
          {
            id: "scope-analytics",
            documentTitle: "Growth Retainer",
            documentKind: "proposal",
            documentEffectiveDate: "2026-01-01",
            sectionTitle: "Monthly Services",
            content:
              "Scope includes CMS maintenance, analytics reviews, bug fixes, and up to four hours of content updates each month.",
            similarity: 0.94,
            authorityScore: 0.94,
          },
        ],
      },
      expected: {
        verdict: "in_scope",
        needsHumanReview: false,
        matchedChunkId: "scope-analytics",
        minConfidence: 0.85,
      },
    },
    {
      id: "in-scope-bug-fixes",
      name: "includes bug fixes",
      category: "clear_in_scope",
      input: {
        ...baseInput,
        clientMessage: "Can you fix the broken contact form this week?",
        chunks: [
          {
            id: "scope-bugs",
            documentTitle: "Growth Retainer",
            documentKind: "proposal",
            documentEffectiveDate: "2026-01-01",
            sectionTitle: "Monthly Services",
            content:
              "Scope includes CMS maintenance, analytics reviews, bug fixes, and up to four hours of content updates each month.",
            similarity: 0.93,
            authorityScore: 0.93,
          },
        ],
      },
      expected: {
        verdict: "in_scope",
        needsHumanReview: false,
        matchedChunkId: "scope-bugs",
        minConfidence: 0.85,
      },
    },
    {
      id: "in-scope-pricing-page",
      name: "includes listed proposal pages",
      category: "clear_in_scope",
      input: {
        ...baseInput,
        clientMessage: "Is the pricing page part of the launch build?",
        chunks: [
          {
            id: "scope-pages",
            documentTitle: "Website Redesign Proposal",
            documentKind: "proposal",
            documentEffectiveDate: "2026-02-01",
            sectionTitle: "Deliverables",
            content:
              "The fixed launch scope includes homepage, pricing page, contact page, and CMS setup.",
            similarity: 0.96,
            authorityScore: 0.96,
          },
        ],
      },
      expected: {
        verdict: "in_scope",
        needsHumanReview: false,
        matchedChunkId: "scope-pages",
        minConfidence: 0.85,
      },
    },
    {
      id: "in-scope-addendum-landing-page",
      name: "includes addendum landing page",
      category: "clear_in_scope",
      input: {
        ...baseInput,
        clientMessage:
          "Can we proceed with the campaign landing page from the addendum?",
        chunks: [
          {
            id: "scope-addendum-landing",
            documentTitle: "Spring Campaign Addendum",
            documentKind: "addendum",
            documentEffectiveDate: "2026-03-15",
            sectionTitle: "Added Deliverables",
            content:
              "This addendum adds one campaign landing page and one email capture form to the original website proposal.",
            similarity: 0.95,
            authorityScore: 1.05,
          },
        ],
      },
      expected: {
        verdict: "in_scope",
        needsHumanReview: false,
        matchedChunkId: "scope-addendum-landing",
        minConfidence: 0.85,
      },
    },
    {
      id: "in-scope-content-updates",
      name: "includes monthly content updates within cap",
      category: "clear_in_scope",
      input: {
        ...baseInput,
        clientMessage:
          "Can you swap the team bios and update two case studies?",
        chunks: [
          {
            id: "scope-content-hours",
            documentTitle: "Growth Retainer",
            documentKind: "proposal",
            documentEffectiveDate: "2026-01-01",
            sectionTitle: "Monthly Services",
            content:
              "Scope includes CMS maintenance, analytics reviews, bug fixes, and up to four hours of content updates each month.",
            similarity: 0.91,
            authorityScore: 0.91,
          },
        ],
      },
      expected: {
        verdict: "in_scope",
        needsHumanReview: false,
        matchedChunkId: "scope-content-hours",
        minConfidence: 0.85,
      },
    },
    {
      id: "out-of-scope-microsite",
      name: "excludes extra microsite",
      category: "clear_out_of_scope",
      input: {
        ...baseInput,
        clientMessage: "Can you build a separate event microsite too?",
        chunks: [
          {
            id: "scope-exclusions",
            documentTitle: "Website Redesign Proposal",
            documentKind: "proposal",
            documentEffectiveDate: "2026-02-01",
            sectionTitle: "Exclusions",
            content:
              "Out of scope: additional microsites, ecommerce, paid media management, and custom integrations unless approved through a change order.",
            similarity: 0.95,
            authorityScore: 0.95,
          },
        ],
      },
      expected: {
        verdict: "out_of_scope",
        needsHumanReview: false,
        matchedChunkId: "scope-exclusions",
        minConfidence: 0.85,
      },
    },
    {
      id: "out-of-scope-ecommerce",
      name: "excludes ecommerce",
      category: "clear_out_of_scope",
      input: {
        ...baseInput,
        clientMessage: "Can we add Shopify checkout to the site?",
        chunks: [
          {
            id: "scope-ecommerce",
            documentTitle: "Website Redesign Proposal",
            documentKind: "proposal",
            documentEffectiveDate: "2026-02-01",
            sectionTitle: "Exclusions",
            content:
              "Out of scope: additional microsites, ecommerce, paid media management, and custom integrations unless approved through a change order.",
            similarity: 0.94,
            authorityScore: 0.94,
          },
        ],
      },
      expected: {
        verdict: "out_of_scope",
        needsHumanReview: false,
        matchedChunkId: "scope-ecommerce",
        minConfidence: 0.85,
      },
    },
    {
      id: "out-of-scope-paid-media",
      name: "excludes paid media management",
      category: "clear_out_of_scope",
      input: {
        ...baseInput,
        clientMessage: "Can your team manage our Google Ads for the launch?",
        chunks: [
          {
            id: "scope-paid-media",
            documentTitle: "Website Redesign Proposal",
            documentKind: "proposal",
            documentEffectiveDate: "2026-02-01",
            sectionTitle: "Exclusions",
            content:
              "Out of scope: additional microsites, ecommerce, paid media management, and custom integrations unless approved through a change order.",
            similarity: 0.92,
            authorityScore: 0.92,
          },
        ],
      },
      expected: {
        verdict: "out_of_scope",
        needsHumanReview: false,
        matchedChunkId: "scope-paid-media",
        minConfidence: 0.85,
      },
    },
    {
      id: "out-of-scope-custom-integration",
      name: "excludes custom integration",
      category: "clear_out_of_scope",
      input: {
        ...baseInput,
        clientMessage: "Could you integrate the site with our custom ERP?",
        chunks: [
          {
            id: "scope-integrations",
            documentTitle: "Website Redesign Proposal",
            documentKind: "proposal",
            documentEffectiveDate: "2026-02-01",
            sectionTitle: "Exclusions",
            content:
              "Out of scope: additional microsites, ecommerce, paid media management, and custom integrations unless approved through a change order.",
            similarity: 0.93,
            authorityScore: 0.93,
          },
        ],
      },
      expected: {
        verdict: "out_of_scope",
        needsHumanReview: false,
        matchedChunkId: "scope-integrations",
        minConfidence: 0.85,
      },
    },
    {
      id: "out-of-scope-extra-page",
      name: "excludes extra page omitted from fixed list",
      category: "clear_out_of_scope",
      input: {
        ...baseInput,
        clientMessage: "Can we add an investor relations page before launch?",
        chunks: [
          {
            id: "scope-fixed-pages",
            documentTitle: "Website Redesign Proposal",
            documentKind: "proposal",
            documentEffectiveDate: "2026-02-01",
            sectionTitle: "Deliverables",
            content:
              "The fixed launch scope includes homepage, pricing page, contact page, and CMS setup. Additional page templates require a signed change order.",
            similarity: 0.9,
            authorityScore: 0.9,
          },
        ],
      },
      expected: {
        verdict: "out_of_scope",
        needsHumanReview: false,
        matchedChunkId: "scope-fixed-pages",
        minConfidence: 0.85,
      },
    },
  ];
