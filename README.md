# TikBot

Telegram bot that monitors TikTok Live streams for treasure box (diamond/coin drop) events and sends real-time notifications. Optionally auto-claims treasure boxes via physical device automation (Android/iOS).

## Features

- **Live Monitoring** — Connects to TikTok Live streams and detects treasure box events in real time
- **Telegram Notifications** — Sends formatted alerts with diamond count, sender info, type, and countdown timer
- **Watch List Management** — Add/remove TikTokers to monitor via Telegram commands
- **Scheduled Reminders** — Get alerted before a treasure box becomes claimable
- **Auto-Claim** *(optional)* — Automatically taps the claim button on a connected Android (ADB) or iOS (WebDriverAgent) device
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
| `ADMIN_CHAT_ID` | Yes | Telegram chat ID for notifications |
| `MONGODB_URI` | No | MongoDB connection string (default: `mongodb://mongo:27017/tikbot`) |
| `TIKTOK_SIGN_API_KEY` | No | API key for TikTok live connector signing |
| `POLL_INTERVAL_MS` | No | How often to check watched users (default: `60000`) |
| `TREASURE_BOX_ALERT_BEFORE_MS` | No | Reminder time before box is claimable (default: `60000`) |
| `LOG_LEVEL` | No | Log level (default: `info`) |

#### Device Auto-Claim (optional)

| Variable | Required | Description |
|---|---|---|
| `DEVICE_ENABLED` | No | Enable device automation (default: `false`) |
| `DEVICE_TYPE` | No | `adb` or `wda` (default: `adb`) |
| `DEVICE_ID` | No | Device identifier |
| `DEVICE_TAP_X` / `DEVICE_TAP_Y` | No | Tap coordinates for the claim button |
| `DEVICE_OPEN_X` / `DEVICE_OPEN_Y` | No | Tap coordinates to open the treasure box |
| `DEVICE_OPEN_DELAY_MS` | No | Delay after opening (default: `1000`) |
| `DEVICE_PRE_CLAIM_MS` | No | Time before claim to start the sequence |
| `DEVICE_NAV_DELAY_MS` | No | Navigation delay (default: `3000`) |
| `DEVICE_WDA_URL` | No | WebDriverAgent URL for iOS (default: `http://localhost:8100`) |

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
| `/unwatch <username>` | Remove a TikToker from the watch list |
| `/list` | Show all watched TikTokers |
| `/status` | Bot health info (uptime, memory, connections) |
| `/device` | Show device status |
| `/device_tap` | Test tap on the connected device |
| `/device_screenshot` | Capture a screenshot from the device |

## Project Structure

```
src/
├── index.ts                    # Entry point
├── config/env.ts               # Environment configuration
├── bot/
│   ├── commands/               # Telegram command handlers
│   └── middleware/              # Error, logging, session middleware
├── services/
│   ├── tiktok.service.ts       # Watch list CRUD + connection triggers
│   ├── notification.service.ts # Telegram message formatting & sending
│   └── claim.service.ts        # Auto-claim job scheduling
├── pkgs/
│   ├── tiktok/                 # TikTok live connection & envelope handling
│   └── device/                 # ADB and WDA device drivers
├── db/
│   ├── connection.ts           # Mongoose connection
│   └── models/                 # MongoDB schemas
└── utils/                      # Logger, formatters
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
