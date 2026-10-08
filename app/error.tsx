"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-lg border-border/60">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10 ring-1 ring-destructive/20">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="pt-2">Something went wrong</CardTitle>
          <CardDescription>
            ScopeSignal hit a snag while loading this view. Your workspace data
            is still safe.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={reset}>Try again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
