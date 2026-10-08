export function formatSlackChannelName(
  channelName: string | null | undefined,
  fallback = "Slack channel",
) {
  if (!channelName) {
    return fallback;
  }

  return channelName.startsWith("#") ? channelName : `#${channelName}`;
}

export function formatSlackMessageTimestamp(
  value: string | null | undefined,
  fallback = "Unknown time",
) {
  if (!value) {
    return fallback;
  }

  const seconds = Number(value);

  if (!Number.isFinite(seconds)) {
    return fallback;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(seconds * 1000));
}
