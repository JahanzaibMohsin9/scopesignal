import { createHash } from "node:crypto";

export type LicenseTierNumber = 1 | 2 | 3;

export const LICENSE_TIER_CONFIG: Record<
  LicenseTierNumber,
  {
    name: string;
    allocatedMonthlyEvents: number;
    summary: string;
  }
> = {
  1: {
    name: "Starter Lifetime",
    allocatedMonthlyEvents: 200,
    summary: "200 managed classifications per month",
  },
  2: {
    name: "Growth Lifetime",
    allocatedMonthlyEvents: 500,
    summary: "500 managed classifications per month",
  },
  3: {
    name: "Agency Lifetime",
    allocatedMonthlyEvents: 1000,
    summary: "1,000 managed classifications per month plus BYOK headroom",
  },
};

export function normalizeLicenseCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function hashLicenseCode(code: string) {
  return createHash("sha256")
    .update(normalizeLicenseCode(code), "utf8")
    .digest("hex");
}

export function getLicenseTierConfig(tierNumber: number) {
  if (tierNumber === 1 || tierNumber === 2 || tierNumber === 3) {
    return LICENSE_TIER_CONFIG[tierNumber];
  }

  return null;
}
