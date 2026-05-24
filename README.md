# TV-TIME Backend

A lightweight Node.js + Express backend for the TV-TIME Roku app.

## Purpose
- Poll Roku ECP to record TV state.
- Store state history in a simple append-only log file.
- Evaluate daily TV usage against a hardcoded limit.
- Launch the TV-TIME app on the Roku when daily limit is reached.

## Getting Started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run in development mode:
   ```bash
   npm run dev
   ```
3. Check the health endpoint:
   ```bash
   curl http://localhost:3000/status
   ```

## Configuration
- `src/config.ts` contains hardcoded Roku device settings and the daily limit.
- You can override Roku IP and app ID with `ROKU_IP` and `ROKU_APP_ID` environment variables.

## Data Storage
- State records are appended to `data/state.log`.

## Endpoints
- `GET /status` - basic server and usage status.
- `GET /poll-state` - trigger a manual Roku state poll and evaluation.
