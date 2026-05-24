import fs from 'fs';
import path from 'path';
import app from './app';
import config from './config';
import { pollAndEvaluateCurrentState } from './tvTime';

const port = config.serverPort;
const dataDir = path.resolve(process.cwd(), 'data');

function ensureDataDirectory() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`Created data directory at ${dataDir}`);
  }
}

async function startPollingLoop() {
  try {
    await pollAndEvaluateCurrentState();
  } catch (error) {
    console.error('Initial Roku poll failed:', error);
  }

  if (process.env.DISABLE_POLLING !== 'true') {
    setInterval(async () => {
      try {
        await pollAndEvaluateCurrentState();
      } catch (error) {
        console.error('Roku poll failed:', error);
      }
    }, config.pollIntervalMs);
  }
}

ensureDataDirectory();

app.listen(port, '0.0.0.0', () => {
  console.log(`TV-TIME backend listening on http://localhost:${port}`);
  console.log(`LAN access enabled on http://0.0.0.0:${port}`);
  startPollingLoop();
});
