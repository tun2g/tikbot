const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const liveUrl = (username: string): string => `https://www.tiktok.com/@${encodeURIComponent(username)}/live`;

const formatDuration = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const BUSINESS_TYPE_LABELS: Record<number, string> = {
  1: 'User Diamond',
  2: 'Platform Diamond',
  3: 'Platform Shell',
  4: 'Portal',
  5: 'Platform Merch',
  6: 'EoY Diamond',
  7: 'Fan Club GtM',
};

export function formatEnvelopeNotification(
  streamer: string,
  diamondCount: number,
  peopleCount: number,
  sendUserName: string,
  businessType: number,
  opensInSeconds?: number,
): string {
  const typeLabel = BUSINESS_TYPE_LABELS[businessType] ?? 'Unknown';
  const senderLine = sendUserName ? `👤 Sent by: <b>${esc(sendUserName)}</b>` : '👤 Sent by: Platform';
  const timeLine = opensInSeconds != null ? `⏳ Opens in: <b>${formatDuration(opensInSeconds)}</b>` : '';
  return [
    `📦 <b>Treasure Box!</b>`,
    ``,
    `📺 Streamer: <b>@${esc(streamer)}</b>`,
    `💎 Coins: <b>${diamondCount.toLocaleString()}</b>`,
    `👥 Claimable by: <b>${peopleCount}</b> people`,
    senderLine,
    `🏷 Type: <b>${esc(typeLabel)}</b>`,
    timeLine,
    ``,
    `🔗 <a href="${liveUrl(streamer)}">Watch Live</a>`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatEnvelopeReminder(streamer: string, secondsLeft: number, diamondCount: number): string {
  return [
    `⏰ <b>Treasure Box Opening Soon!</b>`,
    ``,
    `📺 Streamer: <b>@${esc(streamer)}</b>`,
    `💎 Coins: <b>${diamondCount.toLocaleString()}</b>`,
    `⏳ Opens in: <b>${secondsLeft}s</b>`,
    ``,
    `🔗 <a href="${liveUrl(streamer)}">Open TikTok NOW</a>`,
  ].join('\n');
}

export function formatWatchConfirmation(username: string): string {
  return `✅ Now watching <b>@${esc(username)}</b> for treasure boxes.\n\n🔗 <a href="${liveUrl(username)}">Open TikTok Live</a>`;
}

export function formatUnwatchConfirmation(username: string): string {
  return `🗑 Stopped watching <b>@${esc(username)}</b>.`;
}

export function formatUserNotFound(username: string): string {
  return `❌ <b>@${esc(username)}</b> is not in the watch list.`;
}

export function formatAlreadyWatching(username: string): string {
  return `⚠️ <b>@${esc(username)}</b> is already being watched.`;
}

export function formatClaimScheduled(username: string, opensInSeconds: number): string {
  return [
    `🤖 <b>Auto-claim scheduled</b>`,
    ``,
    `📺 Streamer: <b>@${esc(username)}</b>`,
    `⏳ Claiming in: <b>${formatDuration(opensInSeconds)}</b>`,
  ].join('\n');
}

export function formatClaimSuccess(username: string, diamondCount: number): string {
  return [
    `✅ <b>Treasure Box Claimed!</b>`,
    ``,
    `📺 Streamer: <b>@${esc(username)}</b>`,
    `💎 Coins: <b>${diamondCount.toLocaleString()}</b>`,
  ].join('\n');
}

export function formatClaimFailure(username: string, error: string): string {
  return [
    `❌ <b>Auto-claim Failed</b>`,
    ``,
    `📺 Streamer: <b>@${esc(username)}</b>`,
    `⚠️ Error: <code>${esc(error)}</code>`,
  ].join('\n');
}

export function formatDeviceStatus(
  connected: boolean,
  deviceId: string,
  currentApp: string,
  tapX: number,
  tapY: number,
): string {
  return [
    `📱 <b>Device Status</b>`,
    ``,
    `🔌 Connected: ${connected ? '✅ Yes' : '❌ No'}`,
    `📟 Device: <code>${esc(deviceId)}</code>`,
    `📲 Current app: <code>${esc(currentApp)}</code>`,
    `🎯 Tap coordinates: <b>(${tapX}, ${tapY})</b>`,
  ].join('\n');
}
