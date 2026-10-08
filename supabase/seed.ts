import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const ids = {
  workspace: "10000000-0000-0000-0000-000000000001",
  proposal: "10000000-0000-0000-0000-000000000010",
  proposalDocument: "10000000-0000-0000-0000-000000000011",
  addendumDocument: "10000000-0000-0000-0000-000000000012",
  primaryChannel: "10000000-0000-0000-0000-000000000020",
  launchChannel: "10000000-0000-0000-0000-000000000021",
  internalChannel: "10000000-0000-0000-0000-000000000022",
  primaryContact: "10000000-0000-0000-0000-000000000030",
  secondaryContact: "10000000-0000-0000-0000-000000000031",
  pausedContact: "10000000-0000-0000-0000-000000000032",
  paidMediaAlert: "10000000-0000-0000-0000-000000000040",
  crmAlert: "10000000-0000-0000-0000-000000000041",
  seoAlert: "10000000-0000-0000-0000-000000000042",
  launchQaAlert: "10000000-0000-0000-0000-000000000043",
  croAlert: "10000000-0000-0000-0000-000000000044",
  monthlyUsage: "10000000-0000-0000-0000-000000000050",
  usageLog: "10000000-0000-0000-0000-000000000060",
  firstChunk: "10000000-0000-0000-0000-000000000070",
  secondChunk: "10000000-0000-0000-0000-000000000071",
  thirdChunk: "10000000-0000-0000-0000-000000000072",
  fourthChunk: "10000000-0000-0000-0000-000000000073",
  fifthChunk: "10000000-0000-0000-0000-000000000074",
} as const;

const demoCredentials = {
  owner: {
    email: "owner@demo.scopesignal.ai",
    password: "ScopeSignalDemo123!",
    fullName: "Demo Owner",
  },
  member: {
    email: "ops@demo.scopesignal.ai",
    password: "ScopeSignalDemo123!",
    fullName: "Operations Manager",
  },
} as const;

async function ensureDemoUser(
  email: string,
  password: string,
  fullName: string,
) {
  const { data: listedUsers, error: listError } =
    await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });

  if (listError) {
    throw listError;
  }

  const existingUser = listedUsers.users.find((user) => user.email === email);
  if (existingUser) {
    return existingUser;
  }

  const { data: createdUser, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

  if (createError || !createdUser.user) {
    throw createError ?? new Error(`Failed to create auth user for ${email}.`);
  }

  return createdUser.user;
}

async function upsert(
  table:
    | "workspaces"
    | "users"
    | "proposals"
    | "documents"
    | "chunks"
    | "channels"
    | "client_contacts"
    | "alerts"
    | "monthly_usage"
    | "usage_logs",
  values: Record<string, unknown> | Record<string, unknown>[],
  onConflict: string,
) {
  const query = supabase.from(table).upsert(values as never, { onConflict });
  const { error } = await query;

  if (error) {
    throw error;
  }
}

async function verifySchema(client: SupabaseClient) {
  const { error } = await client.from("workspaces").select("id").limit(1);

  if (error) {
    throw new Error(
      `Unable to reach the Day 3 schema in Supabase. Confirm migrations are applied before seeding. Original error: ${error.message}`,
    );
  }
}

async function main() {
  await verifySchema(supabase);

  const ownerUser = await ensureDemoUser(
    demoCredentials.owner.email,
    demoCredentials.owner.password,
    demoCredentials.owner.fullName,
  );
  const memberUser = await ensureDemoUser(
    demoCredentials.member.email,
    demoCredentials.member.password,
    demoCredentials.member.fullName,
  );

  await upsert(
    "workspaces",
    {
      id: ids.workspace,
      name: "Acme Digital Agency",
      slug: "acme-digital-agency",
      tier: "ltd",
      allocated_monthly_events: 1000,
      managed_usage_enabled: true,
      slack_team_id: "TSANDBOX001",
      slack_team_name: "Acme Digital Agency Slack",
      slack_bot_user_id: "U_SCOPESIGNAL_BOT",
      slack_access_token_ciphertext: "demo-token-placeholder",
    },
    "id",
  );

  await upsert(
    "users",
    [
      {
        id: ownerUser.id,
        workspace_id: ids.workspace,
        email: demoCredentials.owner.email,
        full_name: demoCredentials.owner.fullName,
        role: "owner",
      },
      {
        id: memberUser.id,
        workspace_id: ids.workspace,
        email: demoCredentials.member.email,
        full_name: demoCredentials.member.fullName,
        role: "member",
      },
    ],
    "id",
  );

  await upsert(
    "proposals",
    {
      id: ids.proposal,
      workspace_id: ids.workspace,
      name: "Website Redesign - ClientCo",
      client_name: "ClientCo",
      description:
        "A fixed-scope redesign for ClientCo's marketing site, including discovery, UX, visual design, CMS build, QA, and launch support.",
      effective_date: "2026-03-01",
      signed_at: "2026-03-03T15:30:00Z",
      created_by: ownerUser.id,
    },
    "id",
  );

  await upsert(
    "documents",
    [
      {
        id: ids.proposalDocument,
        workspace_id: ids.workspace,
        proposal_id: ids.proposal,
        parent_document_id: null,
        kind: "proposal",
        status: "indexed",
        title: "Website Redesign - ClientCo Master Proposal",
        storage_bucket: "proposal-documents",
        storage_path: "sandbox/clientco-redesign/master-proposal.pdf",
        file_name: "clientco-website-redesign-proposal.pdf",
        mime_type: "application/pdf",
        file_size_bytes: 428032,
        effective_date: "2026-03-01",
        parsed_text:
          "Included scope covers discovery workshops, sitemap, wireframes, visual design, CMS implementation, responsive QA, and production launch for up to 12 marketing pages. Brand identity, paid media, CRM implementation, custom ecommerce, and post-launch SEO content production are excluded unless covered by a signed change order.",
        created_by: ownerUser.id,
      },
      {
        id: ids.addendumDocument,
        workspace_id: ids.workspace,
        proposal_id: ids.proposal,
        parent_document_id: ids.proposalDocument,
        kind: "addendum",
        status: "indexed",
        title: "Analytics and Launch Support Addendum",
        storage_bucket: "proposal-documents",
        storage_path: "sandbox/clientco-redesign/launch-support-addendum.pdf",
        file_name: "clientco-launch-support-addendum.pdf",
        mime_type: "application/pdf",
        file_size_bytes: 118784,
        effective_date: "2026-03-18",
        parsed_text:
          "The addendum includes two weeks of launch support, analytics verification, redirects QA, and one executive launch report. Ongoing conversion-rate analysis is not included.",
        created_by: ownerUser.id,
      },
    ],
    "id",
  );

  await upsert(
    "chunks",
    [
      {
        id: ids.firstChunk,
        workspace_id: ids.workspace,
        proposal_id: ids.proposal,
        document_id: ids.proposalDocument,
        section_title: "Included Deliverables",
        chunk_index: 0,
        content:
          "Included scope covers discovery workshops, sitemap, wireframes, visual design, CMS implementation, responsive QA, and production launch for up to 12 marketing pages.",
        token_count: 86,
        metadata: {
          source: "sandbox-seed",
          kind: "proposal",
          embedding_model: "text-embedding-3-small",
        },
      },
      {
        id: ids.secondChunk,
        workspace_id: ids.workspace,
        proposal_id: ids.proposal,
        document_id: ids.proposalDocument,
        section_title: "Content Responsibilities",
        chunk_index: 1,
        content:
          "ClientCo is responsible for final approved copy, image licensing, legal review, and all product photography before CMS entry begins.",
        token_count: 74,
        metadata: {
          source: "sandbox-seed",
          kind: "proposal",
          embedding_model: "text-embedding-3-small",
        },
      },
      {
        id: ids.thirdChunk,
        workspace_id: ids.workspace,
        proposal_id: ids.proposal,
        document_id: ids.proposalDocument,
        section_title: "Explicit Exclusions",
        chunk_index: 2,
        content:
          "Brand identity, paid media, CRM implementation, custom ecommerce, and post-launch SEO content production are excluded unless covered by a signed change order.",
        token_count: 92,
        metadata: {
          source: "sandbox-seed",
          kind: "proposal",
          embedding_model: "text-embedding-3-small",
        },
      },
      {
        id: ids.fourthChunk,
        workspace_id: ids.workspace,
        proposal_id: ids.proposal,
        document_id: ids.addendumDocument,
        section_title: "Launch Support Addendum",
        chunk_index: 0,
        content:
          "The addendum includes two weeks of launch support, analytics verification, redirects QA, and one executive launch report.",
        token_count: 64,
        metadata: {
          source: "sandbox-seed",
          kind: "addendum",
          embedding_model: "text-embedding-3-small",
        },
      },
      {
        id: ids.fifthChunk,
        workspace_id: ids.workspace,
        proposal_id: ids.proposal,
        document_id: ids.addendumDocument,
        section_title: "Analytics Boundary",
        chunk_index: 1,
        content:
          "Analytics work is limited to GA4 validation, dashboard handoff, and event QA. Ongoing conversion-rate analysis is not included.",
        token_count: 58,
        metadata: {
          source: "sandbox-seed",
          kind: "addendum",
          embedding_model: "text-embedding-3-small",
        },
      },
    ],
    "id",
  );

  await upsert(
    "channels",
    [
      {
        id: ids.primaryChannel,
        workspace_id: ids.workspace,
        slack_channel_id: "C-SANDBOX-PROJECT",
        name: "clientco-redesign",
        is_private: false,
        is_tracked: true,
        last_synced_at: new Date().toISOString(),
      },
      {
        id: ids.launchChannel,
        workspace_id: ids.workspace,
        slack_channel_id: "C-SANDBOX-LAUNCH",
        name: "clientco-launch",
        is_private: false,
        is_tracked: true,
        last_synced_at: new Date().toISOString(),
      },
      {
        id: ids.internalChannel,
        workspace_id: ids.workspace,
        slack_channel_id: "G-SANDBOX-INTERNAL",
        name: "clientco-internal",
        is_private: true,
        is_tracked: false,
        last_synced_at: new Date().toISOString(),
      },
    ],
    "id",
  );

  await upsert(
    "client_contacts",
    [
      {
        id: ids.primaryContact,
        workspace_id: ids.workspace,
        slack_user_id: "U-SANDBOX-MAYA",
        display_name: "Maya Patel",
        real_name: "Maya Patel",
        email: "maya@clientco.example",
        is_active: true,
        metadata: {
          company: "ClientCo",
          title: "VP Marketing",
        },
      },
      {
        id: ids.secondaryContact,
        workspace_id: ids.workspace,
        slack_user_id: "U-SANDBOX-ELI",
        display_name: "Eli Stone",
        real_name: "Eli Stone",
        email: "eli@clientco.example",
        is_active: true,
        metadata: {
          company: "ClientCo",
          title: "Digital Lead",
        },
      },
      {
        id: ids.pausedContact,
        workspace_id: ids.workspace,
        slack_user_id: "U-SANDBOX-NORA",
        display_name: "Nora Kim",
        real_name: "Nora Kim",
        email: "nora@clientco.example",
        is_active: false,
        metadata: {
          company: "ClientCo",
          title: "Product Manager",
        },
      },
    ],
    "id",
  );

  await upsert(
    "alerts",
    [
      {
        id: ids.paidMediaAlert,
        workspace_id: ids.workspace,
        channel_id: ids.primaryChannel,
        client_contact_id: ids.primaryContact,
        proposal_id: ids.proposal,
        slack_channel_id: "C-SANDBOX-PROJECT",
        slack_message_ts: "1776504300.000100",
        slack_thread_ts: "1776504300.000100",
        client_message:
          "Can your team set up our LinkedIn ad campaigns and manage the launch budget next week?",
        thread_context:
          "Maya Patel: Can your team set up our LinkedIn ad campaigns and manage the launch budget next week?\nProject Manager: Checking the contract scope now.",
        verdict: "out_of_scope",
        confidence: 0.96,
        reason:
          "Paid media setup and campaign management are explicitly excluded from the signed proposal.",
        matched_section: "Explicit Exclusions",
        matched_chunk_ids: [ids.thirdChunk],
        status: "open",
        assigned_user_id: ownerUser.id,
      },
      {
        id: ids.crmAlert,
        workspace_id: ids.workspace,
        channel_id: ids.primaryChannel,
        client_contact_id: ids.secondaryContact,
        proposal_id: ids.proposal,
        slack_channel_id: "C-SANDBOX-PROJECT",
        slack_message_ts: "1776505200.000200",
        slack_thread_ts: "1776505200.000200",
        client_message:
          "Could you connect the new forms to Salesforce and map the lifecycle stages while you are in there?",
        thread_context:
          "Eli Stone: Could you connect the new forms to Salesforce and map the lifecycle stages while you are in there?",
        verdict: "out_of_scope",
        confidence: 0.91,
        reason:
          "CRM implementation is listed as an exclusion and would need a change order.",
        matched_section: "Explicit Exclusions",
        matched_chunk_ids: [ids.thirdChunk],
        status: "sent_draft",
        assigned_user_id: ownerUser.id,
      },
      {
        id: ids.seoAlert,
        workspace_id: ids.workspace,
        channel_id: ids.launchChannel,
        client_contact_id: ids.primaryContact,
        proposal_id: ids.proposal,
        slack_channel_id: "C-SANDBOX-LAUNCH",
        slack_message_ts: "1776506100.000300",
        slack_thread_ts: "1776506100.000300",
        client_message:
          "Please write four new SEO landing pages for the campaign before launch.",
        thread_context:
          "Maya Patel: Please write four new SEO landing pages for the campaign before launch.",
        verdict: "out_of_scope",
        confidence: 0.88,
        reason:
          "Post-launch SEO content production is excluded unless covered by a signed change order.",
        matched_section: "Explicit Exclusions",
        matched_chunk_ids: [ids.thirdChunk],
        status: "open",
        assigned_user_id: ownerUser.id,
      },
      {
        id: ids.launchQaAlert,
        workspace_id: ids.workspace,
        channel_id: ids.launchChannel,
        client_contact_id: ids.secondaryContact,
        proposal_id: ids.proposal,
        slack_channel_id: "C-SANDBOX-LAUNCH",
        slack_message_ts: "1776507000.000400",
        slack_thread_ts: "1776507000.000400",
        client_message:
          "Can you confirm the redirects and analytics events before we publish the new site?",
        thread_context:
          "Eli Stone: Can you confirm the redirects and analytics events before we publish the new site?",
        verdict: "in_scope",
        confidence: 0.93,
        reason:
          "Redirect QA and analytics verification are included in the launch support addendum.",
        matched_section: "Launch Support Addendum",
        matched_chunk_ids: [ids.fourthChunk, ids.fifthChunk],
        status: "resolved",
        assigned_user_id: ownerUser.id,
        resolved_at: "2026-04-18T10:12:00Z",
      },
      {
        id: ids.croAlert,
        workspace_id: ids.workspace,
        channel_id: ids.launchChannel,
        client_contact_id: ids.pausedContact,
        proposal_id: ids.proposal,
        slack_channel_id: "C-SANDBOX-LAUNCH",
        slack_message_ts: "1776507900.000500",
        slack_thread_ts: "1776507900.000500",
        client_message:
          "After launch, can you analyze which homepage variant converts better and recommend copy changes?",
        thread_context:
          "Nora Kim: After launch, can you analyze which homepage variant converts better and recommend copy changes?",
        verdict: "needs_review",
        confidence: 0.67,
        reason:
          "Analytics verification is included, but ongoing conversion-rate analysis is outside the stated analytics boundary.",
        matched_section: "Analytics Boundary",
        matched_chunk_ids: [ids.fifthChunk],
        status: "open",
        assigned_user_id: ownerUser.id,
      },
    ],
    "id",
  );

  await upsert(
    "monthly_usage",
    {
      id: ids.monthlyUsage,
      workspace_id: ids.workspace,
      month_start: "2026-04-01",
      managed_classification_count: 126,
      byok_classification_count: 0,
      prompt_tokens: 84210,
      completion_tokens: 11890,
      total_tokens: 96100,
    },
    "id",
  );

  await upsert(
    "usage_logs",
    {
      id: ids.usageLog,
      workspace_id: ids.workspace,
      alert_id: ids.paidMediaAlert,
      source: "managed",
      provider: "openai",
      model: "gpt-5-mini",
      request_type: "classification",
      prompt_tokens: 668,
      completion_tokens: 118,
      total_tokens: 786,
      raw_usage: {
        prompt_tokens: 668,
        completion_tokens: 118,
        total_tokens: 786,
      },
      request_id: "req_demo_scopesignal_seed",
    },
    "id",
  );

  console.log("Seeded demo workspace successfully.");
  console.log(`Workspace slug: acme-digital-agency`);
  console.log(`Owner login: ${demoCredentials.owner.email}`);
  console.log(`Member login: ${demoCredentials.member.email}`);
}

main().catch((error) => {
  console.error("Failed to seed demo workspace.");
  console.error(error);
  process.exit(1);
});
