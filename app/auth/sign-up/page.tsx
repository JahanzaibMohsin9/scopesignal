import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { signUpAction } from "@/app/auth/actions";
import { AuthMessage } from "@/app/auth/auth-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type SignUpPageProps = {
  searchParams?: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default function SignUpPage({ searchParams }: SignUpPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md border-border/70">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20 ring-1 ring-accent/40">
            <ShieldCheck className="h-5 w-5 text-accent" />
          </div>
          <div>
            <CardTitle className="text-2xl">Create your workspace</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Start with a private workspace for your agency.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form action={signUpAction} className="space-y-4">
            <AuthMessage searchParams={searchParams} />
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-foreground">Full name</span>
              <Input
                id="signup-full-name"
                name="full_name"
                autoComplete="name"
                required
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-foreground">
                Workspace name
              </span>
              <Input
                id="signup-workspace-name"
                name="workspace_name"
                autoComplete="organization"
                required
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-foreground">Email</span>
              <Input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-foreground">Password</span>
              <Input
                id="signup-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <Button id="signup-submit" type="submit" className="w-full">
              Create account
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link className="font-medium text-accent" href="/auth/sign-in">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
