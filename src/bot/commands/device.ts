import { Composer } from 'telegraf';
import type { BotContext } from '@/types/index.js';
import { env } from '@/config/env.js';
import { formatDeviceStatus, formatDeviceError } from '@/utils/format.js';
import { getAutoClaimLine, NO_DEVICE_TEXT } from '@/bot/utils/index.js';

// ---------------------------------------------------------------------------
// /device — show device status and configured claim taps
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

  await ctx.reply(
    formatDeviceStatus({
      autoClaimLine: await getAutoClaimLine(ctx),
      connected,
      deviceType: env.DEVICE_TYPE,
      deviceId: env.DEVICE_ID,
      currentApp,
      boxIcon: { x: env.DEVICE_BOX_ICON_X, y: env.DEVICE_BOX_ICON_Y },
      openButton: { x: env.DEVICE_OPEN_BUTTON_X, y: env.DEVICE_OPEN_BUTTON_Y },
    }),
    { parse_mode: 'HTML' },
  );
});

// ---------------------------------------------------------------------------
// /device_test — run the two claim taps and send a screenshot
// ---------------------------------------------------------------------------

const TEST_CAPTION =
  '🧪 Test run: tapped the treasure box icon, then the "Open" button. Check the screenshot — if the taps missed, adjust DEVICE_BOX_ICON_X/Y and DEVICE_OPEN_BUTTON_X/Y.';

export const deviceTestCommand = new Composer<BotContext>();

deviceTestCommand.command('device_test', async (ctx) => {
  if (!(await ctx.deviceDriver.isConnected())) {
    await ctx.reply(NO_DEVICE_TEXT, { parse_mode: 'HTML' });
    return;
  }

  try {
    await ctx.sendChatAction('upload_photo');
    const buffer = await ctx.claimService.runTestSequence();
    await ctx.replyWithPhoto({ source: buffer, filename: 'test.png' }, { caption: TEST_CAPTION });
  } catch (err) {
    await ctx.reply(formatDeviceError('Test run', err), { parse_mode: 'HTML' });
  }
});

// ---------------------------------------------------------------------------
// /device_screenshot — capture and send a screenshot
// ---------------------------------------------------------------------------

export const deviceScreenshotCommand = new Composer<BotContext>();

deviceScreenshotCommand.command('device_screenshot', async (ctx) => {
  const driver = ctx.deviceDriver;
  if (!(await driver.isConnected())) {
    await ctx.reply(NO_DEVICE_TEXT, { parse_mode: 'HTML' });
    return;
  }

  try {
    const buffer = await driver.screenshot();
    await ctx.replyWithPhoto({ source: buffer, filename: 'screenshot.png' });
  } catch (err) {
    await ctx.reply(formatDeviceError('Screenshot', err), { parse_mode: 'HTML' });
  }
});
