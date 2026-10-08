import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { updatePasswordAction } from "@/app/auth/actions";
import { AuthMessage } from "@/app/auth/auth-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ResetPasswordPageProps = {
  searchParams?: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md border-border/70">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20 ring-1 ring-accent/40">
            <ShieldCheck className="h-5 w-5 text-accent" />
          </div>
          <div>
            <CardTitle className="text-2xl">Choose a new password</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter a fresh password to finish securing your account.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form action={updatePasswordAction} className="space-y-4">
            <AuthMessage searchParams={searchParams} />
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-foreground">New password</span>
              <Input
                id="reset-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-foreground">
                Confirm password
              </span>
              <Input
                id="reset-password-confirm"
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <Button id="reset-password-submit" type="submit" className="w-full">
              Update password
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Need a new link?{" "}
            <Link
              className="font-medium text-accent"
              href="/auth/forgot-password"
            >
              Start again
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
