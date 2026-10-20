# TikBot

Telegram bot that monitors TikTok Live streams for treasure box (diamond/coin drop) events and sends real-time notifications. Optionally auto-claims treasure boxes via physical device automation (Android/iOS).

## Features

- **Live Monitoring** — Connects to TikTok Live streams and detects treasure box events in real time
- **Telegram Notifications** — Sends formatted alerts with diamond count, sender info, type, and countdown timer
- **Watch List Management** — Add/remove TikTokers to monitor via Telegram commands
- **Scheduled Reminders** — Get alerted before a treasure box becomes claimable; survives restarts
- **History & Stats** — Review past boxes and claim results with `/history` and `/stats`
- **Auto-Claim** *(optional)* — Opens the live and taps the treasure box on a connected Android (ADB) or iOS (WebDriverAgent) device, then sends a screenshot
- **Persistent Storage** — MongoDB stores watched users, envelope events, and claim history

## Tech Stack

- **Runtime**: Node.js >= 22
- **Language**: TypeScript (ESM)
- **Bot Framework**: Telegraf
- **Database**: MongoDB (Mongoose)
- **TikTok**: tiktok-live-connector
- **Device Automation**: ADB (Android) / WebDriverAgent (iOS)
- **Logging**: Pino

## Prerequisites

- Node.js >= 22
- pnpm >= 9
- MongoDB 7+ (or use Docker Compose)
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))

## Getting Started

### 1. Clone and install

```bash
git clone <repo-url>
cd tikbot
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | Yes | Telegram bot token |
| `ADMIN_CHAT_ID` | Yes | Telegram chat that receives alerts (see [Access](#access)) |
| `MONGODB_URI` | No | MongoDB connection string (default: `mongodb://mongo:27017/tikbot`) |
| `TIKTOK_SIGN_API_KEY` | No | API key for TikTok live connector signing |
| `POLL_INTERVAL_MS` | No | How often to check watched users (default: `60000`) |
| `TREASURE_BOX_ALERT_BEFORE_MS` | No | Reminder time before box is claimable (default: `60000`) |
| `LOG_LEVEL` | No | Log level (default: `info`) |
| `TZ` | No | Timezone for times shown in messages, e.g. `Asia/Ho_Chi_Minh` (default: server timezone; UTC in Docker) |

Empty values count as unset, so `DEVICE_PRE_CLAIM_MS=` uses the default. A non-numeric value for a numeric variable stops the bot at startup with an error naming the variable.

#### Device Auto-Claim (optional)

| Variable | Required | Description |
|---|---|---|
| `DEVICE_ENABLED` | No | Enable device automation (default: `false`) |
| `DEVICE_TYPE` | No | `adb` or `wda` (default: `adb`) |
| `DEVICE_ID` | No | ADB device serial (default: first connected device) |
| `DEVICE_BOX_ICON_X` / `DEVICE_BOX_ICON_Y` | For auto-claim | **First tap**: the treasure box icon on the live screen |
| `DEVICE_OPEN_BUTTON_X` / `DEVICE_OPEN_BUTTON_Y` | For auto-claim | **Second tap**: the "Open" button in the treasure box popup |
| `DEVICE_PRE_CLAIM_MS` | No | How long before the box opens to open the live on the device (default: `10000`) |
| `DEVICE_NAV_DELAY_MS` | No | Wait after opening the live, for the stream to load (default: `3000`) |
| `DEVICE_OPEN_DELAY_MS` | No | Wait between the box icon tap and the "Open" tap (default: `1000`) |
| `DEVICE_WDA_URL` | No | WebDriverAgent URL for iOS (default: `http://localhost:8100`) |

Auto-claim is on only when `DEVICE_ENABLED=true` **and** both tap positions are set. If it is off, the reason is shown in `/device`, `/status` and the startup message posted to the alerts chat.

### 3. Run

**Development** (with hot reload):

```bash
pnpm dev
```

**Production**:

```bash
pnpm build
pnpm start
```

**Docker Compose** (recommended for production):

```bash
docker compose up -d
```

For development with Docker:

```bash
docker compose -f compose.yaml -f compose.override.yaml up
```

## Bot Commands

| Command | Description |
|---|---|
| `/start` | Start the bot |
| `/help` | Show available commands |
| `/watch <username>` | Add a TikToker to the watch list |
| `/unwatch <username>` | Remove a TikToker from the watch list (also cancels their upcoming boxes) |
| `/list` | Show all watched TikTokers and their connection state |
| `/status` | Bot health: watched/live accounts, upcoming boxes, auto-claim, TikTok connection, uptime |
| `/pending` | Upcoming treasure boxes; tap one to cancel its reminder and auto-claim |
| `/history [username]` | Recent treasure boxes and their claim results |
| `/stats [days]` | Per-streamer box counts and claim results for the last N days |
| `/device` | Device status, auto-claim state and configured tap positions |
| `/device_test` | Run both claim taps and send a screenshot (open a live with a box on the device first) |
| `/device_screenshot` | Capture a screenshot from the device |

### Access

The bot is private. Only the `ADMIN_CHAT_ID` chat and members of that chat (messaging the bot in DMs) can use it; everyone else is ignored.

## How Auto-Claim Works

When a treasure box is detected and auto-claim is on, a claim is scheduled for the box's open time:

1. `DEVICE_PRE_CLAIM_MS` before the box opens, the device opens the streamer's live.
2. It waits `DEVICE_NAV_DELAY_MS` for the stream to load.
3. At the open time it taps the **treasure box icon** (`DEVICE_BOX_ICON_X/Y`).
4. It waits `DEVICE_OPEN_DELAY_MS`, then taps the **"Open" button** (`DEVICE_OPEN_BUTTON_X/Y`).
5. A screenshot is sent to the chat.

The device runs one claim at a time; if two boxes open close together, the second starts late and the message says so.

The bot only sends the taps — it cannot verify that coins were received. Check the screenshot. `/history` and `/stats` report "taps sent", not coins won.

Pending reminders and claims are stored in MongoDB and re-scheduled after a restart. Boxes that opened while the bot was down are reported in the alerts chat as missed.

### Times and timezone

Times in messages use the server timezone. Set `TZ` (e.g. `TZ=Asia/Ho_Chi_Minh`) to change it — the Docker image defaults to UTC.

### Upgrading from an earlier version

The MongoDB schema for watched users and treasure box events changed and there is no migration. Boxes recorded before this change still show in `/history`, but without claim results.

## Project Structure

```
src/
├── index.ts                    # Entry point
├── config/env.ts               # Environment configuration
├── bot/
│   ├── commands/               # Telegram command handlers
│   ├── middleware/             # Error, access, logging, session middleware
│   └── utils/                  # Shared command helpers
├── services/
│   ├── tiktok.service.ts       # Watch list CRUD + connection triggers
│   ├── notification.service.ts # Sends messages/screenshots to Telegram
│   └── claim.service.ts        # Reminders + auto-claim scheduling, restore on restart
├── pkgs/
│   ├── tiktok/                 # TikTok live connection & envelope handling
│   └── device/                 # ADB and WDA device drivers
├── db/
│   ├── connection.ts           # Mongoose connection
│   └── models/                 # MongoDB schemas
└── utils/                      # Logger, user-facing message formatting (format.ts)
```

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start in development mode with hot reload |
| `pnpm build` | Compile TypeScript |
| `pnpm start` | Run compiled output |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Run ESLint with auto-fix |
| `pnpm format` | Run Prettier |

## License

MIT
