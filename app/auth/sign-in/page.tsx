import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { devDemoSignInAction, signInAction } from "@/app/auth/actions";
import { AuthMessage } from "@/app/auth/auth-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type SignInPageProps = {
  searchParams?: Promise<{
    error?: string;
    next?: string;
    success?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const showDevDemoSignIn = process.env.NODE_ENV !== "production";
  const params = await searchParams;
  const next = params?.next;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md border-border/70">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20 ring-1 ring-accent/40">
            <ShieldCheck className="h-5 w-5 text-accent" />
          </div>
          <div>
            <CardTitle className="text-2xl">Sign in to ScopeSignal</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Monitor client requests against the work you already agreed to.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form action={signInAction} className="space-y-4">
            <AuthMessage searchParams={Promise.resolve(params ?? {})} />
            {next && <input type="hidden" name="next" value={next} />}
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-foreground">Email</span>
              <Input
                id="signin-email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-foreground">Password</span>
              <Input
                id="signin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <Button id="signin-submit" type="submit" className="w-full">
              Sign in
            </Button>
          </form>

          {showDevDemoSignIn && (
            <form action={devDemoSignInAction} className="mt-3">
              <Button
                id="signin-demo-submit"
                type="submit"
                variant="outline"
                className="w-full"
              >
                Continue with local demo account
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Uses a confirmed test user, so Supabase email limits will not
                block dashboard testing.
              </p>
            </form>
          )}

          <div className="mt-5 rounded-lg border border-accent/30 bg-accent/10 p-3 text-center">
            <p className="text-sm font-medium text-foreground">
              Want to see it before signing in?
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Try the full sandbox loop with sample proposal data and a
              simulated client message.
            </p>
            <Button asChild className="mt-3 w-full" variant="secondary">
              <Link href="/sandbox">Try the Demo</Link>
            </Button>
          </div>

          <div className="mt-5 flex items-center justify-between text-sm text-muted-foreground">
            <Link
              className="hover:text-foreground"
              href="/auth/forgot-password"
            >
              Forgot password?
            </Link>
            <Link className="font-medium text-accent" href="/auth/sign-up">
              Create account
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
