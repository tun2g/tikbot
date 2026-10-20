import { Composer } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import { esc } from '@/utils/format.js';

interface CommandInfo {
  command: string;
  args?: string;
  description: string;
}

/** Single source for /help and the Telegram command menu (setMyCommands). */
export const COMMANDS: Array<{ group: string; commands: CommandInfo[] }> = [
  {
    group: 'Watching',
    commands: [
      { command: 'watch', args: '<username>', description: 'Start watching a TikToker for treasure boxes' },
      { command: 'unwatch', args: '<username>', description: 'Stop watching a TikToker' },
      { command: 'list', description: 'Watched accounts and whether they are live' },
      { command: 'status', description: 'Bot health, TikTok connection and auto-claim state' },
    ],
  },
  {
    group: 'Boxes',
    commands: [
      { command: 'pending', description: 'Upcoming boxes — cancel a reminder or auto-claim' },
      { command: 'history', args: '[username]', description: 'Last 15 boxes and what happened to each' },
      { command: 'stats', args: '[days]', description: 'Boxes per streamer over the last 7 days (or 1–90)' },
    ],
  },
  {
    group: 'Device',
    commands: [
      { command: 'device', description: 'Phone connection and configured tap positions' },
      { command: 'device_test', description: 'Tap the box icon and "Open" button, then send a screenshot' },
      { command: 'device_screenshot', description: 'Send a screenshot of the phone screen' },
    ],
  },
  {
    group: 'Other',
    commands: [
      { command: 'start', description: 'What this bot does' },
      { command: 'help', description: 'Show this list' },
    ],
  },
];

export const helpCommand = new Composer<BotContext>();

helpCommand.command('help', async (ctx) => {
  const sections = COMMANDS.map(({ group, commands }) =>
    [
      `<b>${esc(group)}</b>`,
      ...commands.map((c) => `/${c.command}${c.args ? ` ${esc(c.args)}` : ''} — ${esc(c.description)}`),
    ].join('\n'),
  );
  await ctx.reply(['📖 <b>Commands</b>', '', sections.join('\n\n')].join('\n'), { parse_mode: 'HTML' });
});
