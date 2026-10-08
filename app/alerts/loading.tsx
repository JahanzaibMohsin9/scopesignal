import { Bell } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function AlertsLoading() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Bell}
        title="Alerts"
        description="Loading scope monitoring activity."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>

      <div className="flex gap-2 border-b border-border/60 pb-3">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-7 w-24" />
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-44" />
        </CardContent>
      </Card>
    </div>
  );
}
