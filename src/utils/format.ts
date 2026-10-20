import type { ClaimStatus, ConnectionState } from '@/db/models/index.js';

export const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const liveUrl = (username: string): string => `https://www.tiktok.com/@${encodeURIComponent(username)}/live`;
const profileUrl = (username: string): string => `https://www.tiktok.com/@${encodeURIComponent(username)}`;

const coins = (n: number): string => n.toLocaleString('en-US');

export const formatDuration = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};

/** Clock time in the server timezone (set TZ to change it), e.g. "14:32:10". */
const clock = (date: Date): string => date.toLocaleTimeString('en-GB', { hour12: false });

/** Short date + time, e.g. "20 Oct 14:32". */
const dateTime = (date: Date): string =>
  date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

const ago = (date: Date): string => `${formatDuration((Date.now() - date.getTime()) / 1000)} ago`;

/** "opens at 14:32:10 (in 3m 20s)" — absolute time stays correct after the message is sent. */
const opensAt = (unpackAt: Date): string => {
  const secondsLeft = (unpackAt.getTime() - Date.now()) / 1000;
  return secondsLeft > 0
    ? `<b>${clock(unpackAt)}</b> (in ${formatDuration(secondsLeft)})`
    : `<b>${clock(unpackAt)}</b> (already open)`;
};

const boxTotal = (diamondCount: number, peopleCount: number): string =>
  peopleCount > 0
    ? `💰 Box total: <b>${coins(diamondCount)} coins</b>, shared by up to <b>${peopleCount}</b> people`
    : `💰 Box total: <b>${coins(diamondCount)} coins</b>`;

// ---------------------------------------------------------------------------
// Treasure box alerts
// ---------------------------------------------------------------------------

export function formatEnvelopeNotification(input: {
  streamer: string;
  diamondCount: number;
  peopleCount: number;
  sendUserName: string;
  unpackAt?: Date;
  autoClaimLine: string;
}): string {
  const { streamer, diamondCount, peopleCount, sendUserName, unpackAt, autoClaimLine } = input;
  return [
    `📦 <b>Treasure Box!</b>`,
    ``,
    `📺 Streamer: <b>@${esc(streamer)}</b>`,
    boxTotal(diamondCount, peopleCount),
    sendUserName ? `👤 Sent by: <b>${esc(sendUserName)}</b>` : `👤 Sender not shown by TikTok`,
    unpackAt ? `⏳ Opens at ${opensAt(unpackAt)}` : `⏳ Open time not provided by TikTok`,
    autoClaimLine,
    ``,
    `🔗 <a href="${liveUrl(streamer)}">Watch Live</a>`,
  ].join('\n');
}

export const autoClaimLineScheduled = '🤖 Auto-claim: <b>scheduled</b> — /pending to cancel';
export const autoClaimLineOff = (reason: string): string => `🤖 Auto-claim: <b>off</b> (${esc(reason)})`;
export const autoClaimLineOn = '🤖 Auto-claim: <b>on</b>, device connected';
export const autoClaimLineNoDevice = '🤖 Auto-claim: <b>on</b>, but ⚠️ <b>no device connected</b> — claims will fail';

export function formatStartup(autoClaimLine: string): string {
  return [`🟢 <b>TikBot started</b>`, '', autoClaimLine].join('\n');
}

export function formatEnvelopeReminder(streamer: string, unpackAt: Date, diamondCount: number): string {
  return [
    `⏰ <b>Treasure Box Opening Soon!</b>`,
    ``,
    `📺 Streamer: <b>@${esc(streamer)}</b>`,
    `💰 Box total: <b>${coins(diamondCount)} coins</b>`,
    `⏳ Opens at ${opensAt(unpackAt)}`,
    ``,
    `🔗 <a href="${liveUrl(streamer)}">Open TikTok NOW</a>`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Watch list
// ---------------------------------------------------------------------------

export type WatchCheck = { kind: 'live' } | { kind: 'offline' } | { kind: 'lookup-failed'; reason: string };

export function formatWatchConfirmation(
  username: string,
  check: WatchCheck,
  alertsChat: string | null,
  pollIntervalMs: number,
): string {
  const statusLine =
    check.kind === 'live'
      ? `🔴 @${esc(username)} is <b>live right now</b> — boxes will be reported from now on.`
      : `⚫ Not live right now. I check every ${formatDuration(pollIntervalMs / 1000)} and connect when the stream starts.`;

  const lines = [`✅ Now watching <b>@${esc(username)}</b> for treasure boxes.`, ''];

  if (check.kind === 'lookup-failed') {
    lines.push(
      `⚠️ I couldn't look up this account on TikTok (${esc(check.reason)}).`,
      `If the username is misspelled, /unwatch ${esc(username)} and add the correct one.`,
      `🔗 <a href="${profileUrl(username)}">Check the profile</a>`,
    );
  } else {
    lines.push(statusLine, `🔗 <a href="${liveUrl(username)}">Open TikTok Live</a>`);
  }

  if (alertsChat) lines.push('', `📣 Alerts are posted in <b>${esc(alertsChat)}</b>.`);
  return lines.join('\n');
}

export function formatUnwatchConfirmation(username: string, cancelledBoxes: number): string {
  const extra =
    cancelledBoxes > 0
      ? `\n\nAlso cancelled reminders and auto-claims for <b>${cancelledBoxes}</b> upcoming box${cancelledBoxes > 1 ? 'es' : ''}.`
      : '';
  return `🗑 Stopped watching <b>@${esc(username)}</b>.${extra}`;
}

export function formatUserNotFound(username: string): string {
  return `❌ <b>@${esc(username)}</b> is not in the watch list. See /list.`;
}

export function formatAlreadyWatching(username: string): string {
  return `⚠️ <b>@${esc(username)}</b> is already being watched. See /list.`;
}

export interface ListEntry {
  username: string;
  connectionState: ConnectionState;
  lastError: string;
  lastCheckedAt: Date | null;
}

export function formatWatchList(users: ListEntry[], pollIntervalMs: number): string {
  if (users.length === 0) {
    return '📋 No users being watched. Use /watch &lt;username&gt; to add one.';
  }

  const lines = users.map((u) => {
    const checked = u.lastCheckedAt ? ` · checked ${ago(u.lastCheckedAt)}` : '';
    const name = `<b>@${esc(u.username)}</b>`;
    switch (u.connectionState) {
      case 'live':
        return `• ${name} — 🔴 LIVE, connected`;
      case 'offline':
        return `• ${name} — ⚫ Not live${checked}`;
      case 'error':
        return `• ${name} — ⚠️ Can't connect: ${esc(u.lastError)}${checked}`;
      default:
        return `• ${name} — ⏳ Not checked yet`;
    }
  });

  return [
    `📋 <b>Watched Users (${users.length})</b>`,
    '',
    ...lines,
    '',
    `<i>Each account is checked every ${formatDuration(pollIntervalMs / 1000)}. /history &lt;username&gt; shows its boxes.</i>`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Auto-claim
// ---------------------------------------------------------------------------

export function formatClaimAttempted(input: {
  username: string;
  diamondCount: number;
  startedLateSeconds: number;
  busyWith?: string;
}): string {
  const { username, diamondCount, startedLateSeconds, busyWith } = input;
  const late =
    startedLateSeconds >= 1
      ? `\n⚠️ Started ${formatDuration(startedLateSeconds)} late${busyWith ? ` — the device was busy claiming @${esc(busyWith)}` : ''}.`
      : '';
  return [
    `🤖 <b>Claim taps sent</b> for @${esc(username)}`,
    `💰 Box total: ${coins(diamondCount)} coins`,
    ``,
    `The bot can't read the result — check the screenshot to see whether coins were received.${late}`,
  ].join('\n');
}

export function formatClaimAttemptedNoScreenshot(username: string, screenshotError: string): string {
  return [
    `🤖 <b>Claim taps sent</b> for @${esc(username)}`,
    ``,
    `⚠️ Couldn't take a screenshot to confirm the result: <code>${esc(screenshotError)}</code>`,
    `Open TikTok on the device to check whether coins were received.`,
  ].join('\n');
}

export function formatClaimFailure(username: string, reason: string): string {
  return [
    `❌ <b>Auto-claim failed</b> for @${esc(username)}`,
    ``,
    `No taps were completed: <code>${esc(reason)}</code>`,
    `Check the device with /device.`,
  ].join('\n');
}

export function formatClaimsLost(boxes: Array<{ username: string; unpackAt: Date | null | undefined }>): string {
  const lines = boxes
    .slice(0, 10)
    .map((b) => `• @${esc(b.username)}${b.unpackAt ? ` — opened ${dateTime(b.unpackAt)}` : ''}`);
  const more = boxes.length > 10 ? [`…and ${boxes.length - 10} more`] : [];
  return [
    `⚠️ <b>Bot restarted</b> — ${boxes.length} box${boxes.length > 1 ? 'es' : ''} opened while it was down and ${boxes.length > 1 ? 'were' : 'was'} not claimed:`,
    '',
    ...lines,
    ...more,
  ].join('\n');
}

export function formatClaimsRestored(count: number): string {
  return `♻️ Bot restarted — re-scheduled reminders${count > 0 ? ' and auto-claims' : ''} for upcoming boxes. See /pending.`;
}

// ---------------------------------------------------------------------------
// /pending
// ---------------------------------------------------------------------------

export interface PendingEntry {
  envelopeId: string;
  username: string;
  diamondCount: number;
  unpackAt: Date;
  autoClaim: boolean;
}

export function formatPendingList(entries: PendingEntry[]): string {
  if (entries.length === 0) return '📭 No upcoming treasure boxes right now.';
  const lines = entries.map(
    (e, i) =>
      `${i + 1}. <b>@${esc(e.username)}</b> — ${coins(e.diamondCount)} coins\n    opens at ${opensAt(e.unpackAt)} · auto-claim ${e.autoClaim ? '<b>on</b>' : 'off'}`,
  );
  return [
    `⏳ <b>Upcoming Boxes (${entries.length})</b>`,
    '',
    ...lines,
    '',
    'Tap a number below to cancel that box.',
  ].join('\n');
}

export function formatCancelConfirm(e: PendingEntry): string {
  return [
    `Cancel <b>@${esc(e.username)}</b>'s box (${coins(e.diamondCount)} coins, opens at ${clock(e.unpackAt)})?`,
    '',
    e.autoClaim
      ? 'The reminder will not be sent and the device will <b>not</b> try to claim it. This can’t be undone.'
      : 'The reminder will not be sent. This can’t be undone.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// /history and /stats
// ---------------------------------------------------------------------------

const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  tracking: '⏳ upcoming',
  attempted: '🤖 taps sent',
  failed: '❌ claim failed',
  cancelled: '✖ cancelled',
  lost: '⚠️ missed (bot was down)',
  untracked: '— not auto-claimed',
};

export interface HistoryEntry {
  username: string;
  diamondCount: number;
  timestamp: Date;
  claimStatus: ClaimStatus;
  claimNote: string;
}

export function formatHistory(entries: HistoryEntry[], username?: string): string {
  const scope = username ? ` for @${esc(username)}` : '';
  if (entries.length === 0) return `📜 No treasure boxes recorded${scope} yet.`;
  const lines = entries.map((e) => {
    const note = e.claimNote ? `\n    <i>${esc(e.claimNote)}</i>` : '';
    return `• ${dateTime(e.timestamp)} · <b>@${esc(e.username)}</b> · ${coins(e.diamondCount)} coins · ${CLAIM_STATUS_LABELS[e.claimStatus]}${note}`;
  });
  return [`📜 <b>Last ${entries.length} boxes${scope}</b>`, '', ...lines].join('\n');
}

export interface StatsRow {
  username: string;
  seen: number;
  attempted: number;
  failed: number;
  missed: number;
  totalCoins: number;
}

export function formatStats(rows: StatsRow[], days: number): string {
  if (rows.length === 0) return `📊 No treasure boxes in the last ${days} days.`;
  const sum = (k: keyof Omit<StatsRow, 'username'>) => rows.reduce((acc, r) => acc + r[k], 0);
  const line = (r: Omit<StatsRow, 'username'>) =>
    `${r.seen} seen · ${r.attempted} taps sent · ${r.failed} failed · ${r.missed} missed`;
  return [
    `📊 <b>Last ${days} days</b>`,
    '',
    `<b>All streamers:</b> ${line({ seen: sum('seen'), attempted: sum('attempted'), failed: sum('failed'), missed: sum('missed'), totalCoins: sum('totalCoins') })}`,
    `Boxes held <b>${coins(sum('totalCoins'))}</b> coins in total (not what you received — that is only visible on the device).`,
    '',
    ...rows.map((r) => `• <b>@${esc(r.username)}</b>: ${line(r)}`),
    '',
    `<i>"Taps sent" means the device tapped the box — check each screenshot for the result. Details: /history &lt;username&gt;</i>`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export function formatServiceDown(reason: string): string {
  return [
    `⚠️ <b>Can't connect to TikTok</b>`,
    '',
    `The TikTok signing service refused the connection: <code>${esc(reason)}</code>`,
    `Treasure boxes may be missed until this clears. I'll keep retrying and tell you when it recovers.`,
  ].join('\n');
}

export function formatServiceRestored(downSince: Date): string {
  return `✅ <b>TikTok connection restored</b> (was failing since ${dateTime(downSince)}).`;
}

export function formatStatus(input: {
  uptimeSeconds: number;
  memMB: string;
  watched: number;
  live: number;
  serviceError: { reason: string; since: Date } | null;
  autoClaimLine: string;
  pending: number;
}): string {
  const { uptimeSeconds, memMB, watched, live, serviceError, autoClaimLine, pending } = input;
  return [
    '🤖 <b>Bot Status</b>',
    '',
    `👀 Watching <b>${watched}</b> accounts · <b>${live}</b> live and connected now (/list)`,
    `⏳ Upcoming boxes: <b>${pending}</b> (/pending)`,
    autoClaimLine,
    serviceError
      ? `⚠️ TikTok connection failing since ${dateTime(serviceError.since)}: <code>${esc(serviceError.reason)}</code>`
      : '✅ TikTok connection OK',
    '',
    `⏱ Uptime: ${formatDuration(uptimeSeconds)} · 🧠 Memory: ${memMB} MB`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Device
// ---------------------------------------------------------------------------

export function formatDeviceStatus(input: {
  autoClaimLine: string;
  connected: boolean;
  deviceType: 'adb' | 'wda';
  deviceId: string;
  currentApp: string;
  boxIcon: { x: number; y: number };
  openButton: { x: number; y: number };
}): string {
  const { autoClaimLine, connected, deviceType, deviceId, currentApp, boxIcon, openButton } = input;
  const deviceLabel =
    deviceType === 'wda'
      ? 'iPhone via WebDriverAgent'
      : deviceId
        ? `<code>${esc(deviceId)}</code>`
        : 'first connected Android device';
  return [
    `📱 <b>Device Status</b>`,
    ``,
    autoClaimLine,
    `🔌 Connected: ${connected ? '✅ Yes' : '❌ No'} — ${deviceLabel}`,
    connected ? `📲 App on screen: <code>${esc(currentApp)}</code>` : '',
    ``,
    `<b>Claim taps</b>`,
    `1️⃣ Treasure box icon: (${boxIcon.x}, ${boxIcon.y})`,
    `2️⃣ "Open" button in the popup: (${openButton.x}, ${openButton.y})`,
    ``,
    `<i>/device_test runs both taps and sends a screenshot. Open a live with a treasure box on the device first.</i>`,
  ]
    .filter((l, i, arr) => l !== '' || arr[i - 1] !== '')
    .join('\n');
}

export function formatDeviceError(action: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `❌ ${esc(action)} failed: <code>${esc(message)}</code>`;
}
