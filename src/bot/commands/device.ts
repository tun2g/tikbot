import { Composer } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import { env } from '@/config/env.js';
import { formatDeviceStatus } from '@/utils/format.js';

// ---------------------------------------------------------------------------
// /device — show device status
// ---------------------------------------------------------------------------

export const deviceCommand = new Composer<BotContext>();

deviceCommand.command('device', async (ctx) => {
  const driver = ctx.deviceDriver;
  const connected = await driver.isConnected();

  let currentApp = 'unknown';
  if (connected) {
    try {
      currentApp = await driver.currentApp();
    } catch {
      currentApp = 'unknown';
    }
  }

  const { DEVICE_ID: deviceId, DEVICE_TAP_X: tapX, DEVICE_TAP_Y: tapY } = env;

  await ctx.reply(formatDeviceStatus(connected, deviceId, currentApp, tapX, tapY), { parse_mode: 'HTML' });
});

// ---------------------------------------------------------------------------
// /device_tap — send a tap at configured coordinates
// ---------------------------------------------------------------------------

export const deviceTapCommand = new Composer<BotContext>();

deviceTapCommand.command('device_tap', async (ctx) => {
  const driver = ctx.deviceDriver;
  const connected = await driver.isConnected();
  if (!connected) {
    await ctx.reply('No device connected', { parse_mode: 'HTML' });
    return;
  }

  try {
    await driver.tap(env.DEVICE_TAP_X, env.DEVICE_TAP_Y);
    await ctx.reply(`Tapped at (<b>${env.DEVICE_TAP_X}</b>, <b>${env.DEVICE_TAP_Y}</b>)`, { parse_mode: 'HTML' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Tap failed: <code>${message}</code>`, { parse_mode: 'HTML' });
  }
});

// ---------------------------------------------------------------------------
// /device_screenshot — capture and send a screenshot
// ---------------------------------------------------------------------------

export const deviceScreenshotCommand = new Composer<BotContext>();

deviceScreenshotCommand.command('device_screenshot', async (ctx) => {
  const driver = ctx.deviceDriver;
  const connected = await driver.isConnected();
  if (!connected) {
    await ctx.reply('No device connected', { parse_mode: 'HTML' });
    return;
  }

  try {
    const buffer = await driver.screenshot();
    await ctx.replyWithPhoto({ source: buffer, filename: 'screenshot.png' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Screenshot failed: <code>${message}</code>`, { parse_mode: 'HTML' });
  }
});
