import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProposalsLoading() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileText}
        title="Proposals"
        description="Loading uploaded proposal documents."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
