"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureUserWorkspace } from "@/lib/auth/workspace";

const DEV_DEMO_EMAIL = "demo@scopesignal.local";
const DEV_DEMO_PASSWORD = "ScopeSignalDemo123!";

function isDevAuthEnabled() {
  return process.env.NODE_ENV !== "production";
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function encodedMessage(
  path: string,
  type: "error" | "success",
  message: string,
) {
  const searchParams = new URLSearchParams({ [type]: message });
  return `${path}?${searchParams.toString()}`;
}

function getSafeRedirectPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

async function getRequestOrigin() {
  const headersList = await headers();
  const origin = headersList.get("origin");

  if (origin) {
    return origin;
  }

  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = headersList.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

export async function signInAction(formData: FormData) {
  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const next = getSafeRedirectPath(getString(formData, "next") || "/dashboard");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirect(
      encodedMessage(
        "/auth/sign-in",
        "error",
        error?.message ?? "Unable to sign in with those credentials.",
      ),
    );
  }

  await ensureUserWorkspace({ user: data.user });
  revalidatePath("/", "layout");
  redirect(next);
}

export async function signUpAction(formData: FormData) {
  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const fullName = getString(formData, "full_name");
  const workspaceName = getString(formData, "workspace_name");
  const origin = await getRequestOrigin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        workspace_name: workspaceName,
      },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error || !data.user) {
    const message =
      error?.message?.toLowerCase().includes("rate limit") && isDevAuthEnabled()
        ? "Supabase email rate limit reached. Use the local demo account on the sign-in page to keep testing."
        : (error?.message ?? "Unable to create your account.");

    redirect(encodedMessage("/auth/sign-up", "error", message));
  }

  await ensureUserWorkspace({ user: data.user, fullName, workspaceName });
  revalidatePath("/", "layout");

  if (!data.session) {
    redirect(
      encodedMessage(
        "/auth/sign-in",
        "success",
        "Account created. Check your email to confirm your login.",
      ),
    );
  }

  redirect("/dashboard");
}

export async function devDemoSignInAction() {
  if (!isDevAuthEnabled()) {
    redirect(
      encodedMessage(
        "/auth/sign-in",
        "error",
        "The demo sign-in shortcut is only available in local development.",
      ),
    );
  }

  const adminSupabase = createSupabaseAdminClient();
  const userMetadata = {
    full_name: "Demo Owner",
    workspace_name: "ScopeSignal Demo",
  };

  const { data: usersPage, error: listError } =
    await adminSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

  if (listError) {
    redirect(encodedMessage("/auth/sign-in", "error", listError.message));
  }

  const existingUser = usersPage.users.find(
    (user) => user.email?.toLowerCase() === DEV_DEMO_EMAIL,
  );

  const { data: adminUserData, error: adminUserError } = existingUser
    ? await adminSupabase.auth.admin.updateUserById(existingUser.id, {
        password: DEV_DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: userMetadata,
      })
    : await adminSupabase.auth.admin.createUser({
        email: DEV_DEMO_EMAIL,
        password: DEV_DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: userMetadata,
      });

  if (adminUserError || !adminUserData.user) {
    redirect(
      encodedMessage(
        "/auth/sign-in",
        "error",
        adminUserError?.message ?? "Unable to prepare the demo account.",
      ),
    );
  }

  await ensureUserWorkspace({
    user: adminUserData.user,
    fullName: userMetadata.full_name,
    workspaceName: userMetadata.workspace_name,
  });

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: DEV_DEMO_EMAIL,
    password: DEV_DEMO_PASSWORD,
  });

  if (signInError) {
    redirect(encodedMessage("/auth/sign-in", "error", signInError.message));
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function forgotPasswordAction(formData: FormData) {
  const email = getString(formData, "email");
  const origin = await getRequestOrigin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
  });

  if (error) {
    redirect(encodedMessage("/auth/forgot-password", "error", error.message));
  }

  redirect(
    encodedMessage(
      "/auth/forgot-password",
      "success",
      "Password reset email sent.",
    ),
  );
}

export async function updatePasswordAction(formData: FormData) {
  const password = getString(formData, "password");
  const confirmPassword = getString(formData, "confirm_password");

  if (password.length < 8) {
    redirect(
      encodedMessage(
        "/auth/reset-password",
        "error",
        "Password must be at least 8 characters long.",
      ),
    );
  }

  if (password !== confirmPassword) {
    redirect(
      encodedMessage(
        "/auth/reset-password",
        "error",
        "Passwords do not match.",
      ),
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      encodedMessage(
        "/auth/sign-in",
        "error",
        "Your reset session expired. Request a new password reset link.",
      ),
    );
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(encodedMessage("/auth/reset-password", "error", error.message));
  }

  revalidatePath("/", "layout");
  redirect(
    encodedMessage(
      "/dashboard",
      "success",
      "Password updated. You are signed in.",
    ),
  );
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/auth/sign-in");
}
