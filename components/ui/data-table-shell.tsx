"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableShellProps {
  /** Column header labels */
  columns: string[];
  /** Number of skeleton rows to render while loading */
  rowCount?: number;
}

/**
 * DataTableShell renders a table skeleton while page data is loading.
 * Replace this component with the real <DataTable> once data is available.
 */
export function DataTableShell({ columns, rowCount = 5 }: DataTableShellProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <Table>
        <TableHeader>
          <TableRow className="border-border/60 hover:bg-transparent">
            {columns.map((col) => (
              <TableHead
                key={col}
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {col}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rowCount }).map((_, rowIdx) => (
            <TableRow
              key={rowIdx}
              className="border-border/40 hover:bg-muted/30"
            >
              {columns.map((col, colIdx) => (
                <TableCell key={col}>
                  <Skeleton
                    className={`h-4 rounded ${
                      colIdx === 0
                        ? "w-32"
                        : colIdx === columns.length - 1
                          ? "w-16"
                          : "w-24"
                    }`}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
