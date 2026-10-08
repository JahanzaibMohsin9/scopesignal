import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-lg border-border/60">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 ring-1 ring-accent/20">
            <FileQuestion className="h-6 w-6 text-accent" />
          </div>
          <CardTitle className="pt-2">Page not found</CardTitle>
          <CardDescription>
            This page may have moved, or the workspace item is no longer
            available.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
