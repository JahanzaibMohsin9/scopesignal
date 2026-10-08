"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUserWorkspace } from "@/lib/auth/workspace";
import {
  getLicenseTierConfig,
  hashLicenseCode,
  normalizeLicenseCode,
} from "@/lib/license/entitlements";

export type RedeemLicenseCodeState = {
  success?: string;
  error?: string;
};

type LicenseRedemptionCodeRow = {
  id: string;
  tier_number: number;
  allocated_monthly_events: number;
  redeemed_workspace_id: string | null;
};

async function getWorkspaceContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const workspaceId = await ensureUserWorkspace({ user });
  return { user, workspaceId };
}

function getCode(formData: FormData) {
  const value = formData.get("code");
  return typeof value === "string" ? normalizeLicenseCode(value) : "";
}

export async function redeemLicenseCodeAction(
  _previousState: RedeemLicenseCodeState,
  formData: FormData,
): Promise<RedeemLicenseCodeState> {
  const context = await getWorkspaceContext();

  if (!context) {
    return { error: "You must be signed in to redeem a license code." };
  }

  const code = getCode(formData);

  if (code.length < 8) {
    return { error: "Enter a valid license code." };
  }

  const adminSupabase = createSupabaseAdminClient();
  const codeHash = hashLicenseCode(code);
  const { data: existingCode, error: lookupError } = await adminSupabase
    .from("license_redemption_codes")
    .select(
      "id, tier_number, allocated_monthly_events, redeemed_workspace_id",
    )
    .eq("code_hash", codeHash)
    .maybeSingle<LicenseRedemptionCodeRow>();

  if (lookupError) {
    return { error: lookupError.message };
  }

  if (!existingCode) {
    return { error: "This license code was not found." };
  }

  if (
    existingCode.redeemed_workspace_id &&
    existingCode.redeemed_workspace_id !== context.workspaceId
  ) {
    return { error: "This license code has already been redeemed." };
  }

  const tierConfig = getLicenseTierConfig(existingCode.tier_number);
  const allocatedMonthlyEvents =
    existingCode.allocated_monthly_events ||
    tierConfig?.allocatedMonthlyEvents ||
    100;

  if (!existingCode.redeemed_workspace_id) {
    const { data: redeemedCode, error: redeemError } = await adminSupabase
      .from("license_redemption_codes")
      .update({
        redeemed_workspace_id: context.workspaceId,
        redeemed_by_user_id: context.user.id,
        redeemed_at: new Date().toISOString(),
      })
      .eq("id", existingCode.id)
      .is("redeemed_at", null)
      .select("id")
      .maybeSingle();

    if (redeemError) {
      return { error: redeemError.message };
    }

    if (!redeemedCode) {
      return { error: "This license code was redeemed by another workspace." };
    }
  }

  const { error: workspaceError } = await adminSupabase
    .from("workspaces")
    .update({
      tier: "ltd",
      allocated_monthly_events: allocatedMonthlyEvents,
      managed_usage_enabled: true,
    })
    .eq("id", context.workspaceId);

  if (workspaceError) {
    return { error: workspaceError.message };
  }

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  revalidatePath("/settings/license");
  revalidatePath("/dashboard");

  return {
    success: `${tierConfig?.name ?? "Lifetime plan"} activated: ${allocatedMonthlyEvents.toLocaleString()} managed classifications per month.`,
  };
}
