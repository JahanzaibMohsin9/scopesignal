/**
 * Sandbox-only mode serves the public sandbox and nothing else. It never
 * touches Supabase, so it can be built and hosted as a standalone demo.
 */
export const sandboxOnly = process.env.NEXT_PUBLIC_SANDBOX_ONLY === "1";
