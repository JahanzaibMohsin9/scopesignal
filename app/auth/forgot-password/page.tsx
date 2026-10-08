import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { forgotPasswordAction } from "@/app/auth/actions";
import { AuthMessage } from "@/app/auth/auth-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ForgotPasswordPageProps = {
  searchParams?: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md border-border/70">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20 ring-1 ring-accent/40">
            <ShieldCheck className="h-5 w-5 text-accent" />
          </div>
          <div>
            <CardTitle className="text-2xl">Reset your password</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              We will send a secure reset link to your inbox.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form action={forgotPasswordAction} className="space-y-4">
            <AuthMessage searchParams={searchParams} />
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-foreground">Email</span>
              <Input
                id="forgot-password-email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </label>
            <Button
              id="forgot-password-submit"
              type="submit"
              className="w-full"
            >
              Send reset link
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link className="font-medium text-accent" href="/auth/sign-in">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
