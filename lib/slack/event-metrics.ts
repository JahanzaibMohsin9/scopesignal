import type { SlackSkipReason } from "@/lib/slack/event-prefilter";

export type SlackEventMetricsSnapshot = {
  received: number;
  accepted: number;
  skipped: Partial<Record<SlackSkipReason, number>>;
};

const metrics: SlackEventMetricsSnapshot = {
  received: 0,
  accepted: 0,
  skipped: {},
};

export function recordSlackEventReceived() {
  metrics.received += 1;
}

export function recordSlackEventAccepted() {
  metrics.accepted += 1;
}

export function recordSlackEventSkipped(reason: SlackSkipReason) {
  metrics.skipped[reason] = (metrics.skipped[reason] ?? 0) + 1;
}

export function getSlackEventMetricsSnapshot(): SlackEventMetricsSnapshot {
  return {
    received: metrics.received,
    accepted: metrics.accepted,
    skipped: { ...metrics.skipped },
  };
}

export function resetSlackEventMetrics() {
  metrics.received = 0;
  metrics.accepted = 0;
  metrics.skipped = {};
}
