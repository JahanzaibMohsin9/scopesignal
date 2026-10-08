import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-border/60 pb-3">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-24" />
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72 max-w-[70vw]" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    </div>
  );
}
