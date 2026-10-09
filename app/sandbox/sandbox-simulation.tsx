"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CheckCircle2,
  FileSearch,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  sandboxChannels,
  sandboxContacts,
  sandboxSimulationMessages,
  sandboxSimulationScenarios,
  type SandboxAlertStatus,
  type SandboxSimulationStep,
  type SandboxVerdict,
} from "@/lib/sandbox/demo-data";
import { cn } from "@/lib/utils";

type SimulationScenario = (typeof sandboxSimulationScenarios)[number];
type SimulationAlert = SimulationScenario["alert"];

type ChatMessage = {
  id: string;
  sender: string;
  role: "agency" | "client" | "system";
  text: string;
  timestamp: string;
};

const stepCopy: Record<
  SandboxSimulationStep,
  { label: string; description: string }
> = {
  idle: {
    label: "Ready",
    description: "Pick a client message to start the simulated Slack flow.",
  },
  message_sent: {
    label: "A client sent this",
    description: "The message arrives from a tagged ClientCo contact.",
  },
  retrieving_scope: {
    label: "ScopeSignal compared it to your proposal",
    description: "The sandbox checks the indexed proposal and addendum chunks.",
  },
  classifying: {
    label: "Classification running",
    description: "A pre-computed result stands in for the production AI call.",
  },
  alert_ready: {
    label: "Your team gets this alert",
    description:
      "The dashboard updates instantly with the verdict and evidence.",
  },
};

function formatVerdict(verdict: SandboxVerdict) {
  if (verdict === "out_of_scope") return "Out of scope";
  if (verdict === "needs_review") return "Needs review";
  return "In scope";
}

function verdictVariant(verdict: SandboxVerdict) {
  if (verdict === "out_of_scope") return "destructive" as const;
  if (verdict === "needs_review") return "warning" as const;
  return "success" as const;
}

function formatStatus(status: SandboxAlertStatus) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function statusVariant(status: SandboxAlertStatus) {
  if (status === "open") return "info" as const;
  if (status === "resolved" || status === "sent_draft")
    return "success" as const;
  return "secondary" as const;
}

function getContactName(contactId: string) {
  return (
    sandboxContacts.find((contact) => contact.id === contactId)?.displayName ??
    "Client"
  );
}

function getContactTitle(contactId: string) {
  return (
    sandboxContacts.find((contact) => contact.id === contactId)?.title ??
    "Client contact"
  );
}

function getChannelName(channelId: string) {
  return (
    sandboxChannels.find((channel) => channel.id === channelId)?.name ??
    "unknown-channel"
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

export function SandboxSimulation() {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(
    sandboxSimulationMessages.map((message) => ({ ...message })),
  );
  const [step, setStep] = useState<SandboxSimulationStep>("idle");
  const [activeScenario, setActiveScenario] =
    useState<SimulationScenario | null>(null);
  const [liveAlerts, setLiveAlerts] = useState<SimulationAlert[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!activeScenario || !isRunning) return;

    const timers = [
      window.setTimeout(() => setStep("retrieving_scope"), 700),
      window.setTimeout(() => setStep("classifying"), 1500),
      window.setTimeout(() => {
        setStep("alert_ready");
        setLiveAlerts((alerts) => [
          {
            ...activeScenario.alert,
            id: `${activeScenario.alert.id}-${Date.now()}`,
            createdAt: new Date().toISOString(),
          },
          ...alerts,
        ]);
        setChatMessages((messages) => [
          ...messages,
          {
            id: `${activeScenario.id}-system-${Date.now()}`,
            sender: "ScopeSignal",
            role: "system",
            text: activeScenario.generatedReply,
            timestamp: new Date().toLocaleTimeString("en", {
              hour: "numeric",
              minute: "2-digit",
            }),
          },
        ]);
        setIsRunning(false);
      }, 2400),
    ];

    return () => timers.forEach(window.clearTimeout);
  }, [activeScenario, isRunning]);

  const activeStepIndex = useMemo(() => {
    if (step === "message_sent") return 0;
    if (step === "retrieving_scope" || step === "classifying") return 1;
    if (step === "alert_ready") return 2;
    return -1;
  }, [step]);

  function startScenario(scenario: SimulationScenario) {
    if (isRunning) return;
    const contactName = getContactName(scenario.contactId);
    const now = new Date();

    setActiveScenario(scenario);
    setStep("message_sent");
    setChatMessages((messages) => [
      ...messages,
      {
        id: `${scenario.id}-client-${now.getTime()}`,
        sender: contactName,
        role: "client",
        text: scenario.clientMessage,
        timestamp: now.toLocaleTimeString("en", {
          hour: "numeric",
          minute: "2-digit",
        }),
      },
    ]);
    setIsRunning(true);
  }

  return (
    <section
      id="sandbox-simulation"
      className="relative overflow-hidden rounded-xl border border-accent/25 bg-card/80 p-4 shadow-[0_18px_45px_color-mix(in_oklab,var(--foreground)_10%,transparent)] backdrop-blur-md sm:p-6"
    >
      <div className="flex items-start justify-between gap-6">
        <div className="max-w-3xl">
          <Badge variant="info" className="rounded-md">
            Browser-only simulation
          </Badge>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            Watch a client request become a scope alert
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Send a test Slack message, let the sandbox compare it against the
            ClientCo proposal, and watch the alert appear without using Slack,
            OpenAI, or your real quota.
          </p>
        </div>
        <div className="hidden w-72 shrink-0 rounded-lg border border-border/70 bg-background/95 p-3 shadow-sm xl:block">
          <p className="text-xs font-semibold uppercase text-accent">
            Guided walkthrough
          </p>
          <div className="mt-3 space-y-3">
            {[
              "A client sent this",
              "ScopeSignal compared it to your proposal",
              "Your team gets this alert",
            ].map((label, index) => (
              <div key={label} className="flex gap-2">
                <div
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px]",
                    activeStepIndex >= index
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {activeStepIndex > index ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    index + 1
                  )}
                </div>
                <p
                  className={cn(
                    "text-xs leading-5",
                    activeStepIndex >= index
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className="rounded-lg border border-border/70 bg-background/55 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-accent" />
              <div>
                <p className="font-medium">#clientco-redesign</p>
                <p className="text-xs text-muted-foreground">
                  Simulated Slack thread
                </p>
              </div>
            </div>
            <Badge variant={isRunning ? "warning" : "success"}>
              {isRunning ? "Processing" : "Live"}
            </Badge>
          </div>

          <div className="h-[420px] space-y-4 overflow-y-auto px-4 py-4">
            {chatMessages.map((message) => {
              const isAgency = message.role === "agency";
              const isSystem = message.role === "system";
              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    isAgency ? "justify-end" : "justify-start",
                  )}
                >
                  {!isAgency ? (
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
                        isSystem
                          ? "bg-accent text-accent-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {isSystem ? (
                        <Sparkles className="h-4 w-4" />
                      ) : (
                        getInitials(message.sender)
                      )}
                    </div>
                  ) : null}
                  <div
                    className={cn(
                      "max-w-[82%] rounded-lg border px-3 py-2",
                      isAgency
                        ? "border-accent/35 bg-accent/10"
                        : "border-border/70 bg-card/70",
                      isSystem ? "border-accent/40 bg-accent/10" : null,
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-medium">{message.sender}</p>
                      <p className="text-xs text-muted-foreground">
                        {message.timestamp}
                      </p>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {message.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-border/70 p-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {sandboxSimulationScenarios.map((scenario) => (
                <Button
                  key={scenario.id}
                  type="button"
                  variant={
                    scenario.id === activeScenario?.id ? "default" : "outline"
                  }
                  className="h-auto justify-start whitespace-normal py-2 text-left"
                  disabled={isRunning}
                  onClick={() => startScenario(scenario)}
                >
                  <Send className="h-4 w-4 shrink-0" />
                  <span>{scenario.buttonText}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border/70 bg-background/60 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
                {step === "retrieving_scope" ? (
                  <FileSearch className="h-5 w-5 animate-pulse" />
                ) : step === "alert_ready" ? (
                  <BellRing className="h-5 w-5" />
                ) : (
                  <Sparkles className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="font-semibold">{stepCopy[step].label}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {stepCopy[step].description}
                </p>
              </div>
            </div>
          </div>

          <div
            id="sandbox-live-alerts"
            className="rounded-lg border border-border/70 bg-background/55 shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
              <div>
                <p className="font-medium">Live Alerts</p>
                <p className="text-xs text-muted-foreground">
                  New simulated classifications appear here first.
                </p>
              </div>
              <Badge variant="secondary">{liveAlerts.length} new</Badge>
            </div>

            <div className="min-h-[332px] space-y-3 p-4">
              {liveAlerts.length === 0 ? (
                <div className="flex h-[292px] items-center justify-center rounded-lg border border-dashed border-border/70 px-6 text-center">
                  <div>
                    <BellRing className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">
                      Send a test message to generate an alert.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      The sandbox uses pre-computed verdicts, so it is instant
                      and repeatable.
                    </p>
                  </div>
                </div>
              ) : (
                liveAlerts.map((alert) => (
                  <article
                    key={alert.id}
                    className="rounded-lg border border-border/70 bg-card/85 p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-xs font-semibold text-foreground">
                          {getInitials(getContactName(alert.contactId))}
                        </div>
                        <div>
                          <p className="font-medium">
                            {getContactName(alert.contactId)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {getContactTitle(alert.contactId)} in #
                            {getChannelName(alert.channelId)}
                          </p>
                        </div>
                      </div>
                      <Badge variant={verdictVariant(alert.verdict)}>
                        {formatVerdict(alert.verdict)}
                      </Badge>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-foreground">
                      {alert.clientMessage}
                    </p>
                    <div className="mt-3 rounded-md border border-border/70 bg-background/60 p-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Evidence
                      </p>
                      <p className="mt-1 text-sm text-foreground">
                        {alert.matchedSection}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {alert.reason}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant={statusVariant(alert.status)}>
                        {formatStatus(alert.status)}
                      </Badge>
                      <span>
                        {Math.round(alert.confidence * 100)}% confidence
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
