import config from './config';
import { getRokuState, launchRokuApp, RokuState } from './roku';
import { appendStateRecord, readAllStateRecords, StateRecord } from './db';

function isWatching(state: RokuState): boolean {
  const activeId = state.activeAppId.toLowerCase();
  if (activeId === config.roku.appId.toLowerCase()) {
    return false;
  }
  return activeId !== 'unknown';
}

function getTodayRecords(records: StateRecord[]): StateRecord[] {
  const today = new Date().toISOString().slice(0, 10);
  return records.filter((record) => record.timestamp.startsWith(today));
}

function computeDailyUsageMinutes(records: StateRecord[]): number {
  if (records.length < 2) {
    return 0;
  }

  const ordered = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let totalMinutes = 0;

  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    const previousTime = new Date(previous.timestamp).getTime();
    const currentTime = new Date(current.timestamp).getTime();
    const deltaMinutes = Math.min((currentTime - previousTime) / 60000, 15);

    if (previous.watched) {
      totalMinutes += deltaMinutes;
    }
  }

  return Math.round(totalMinutes);
}

export async function pollAndEvaluateCurrentState() {
  const rokuState = await getRokuState(config.roku.ip);
  const watched = isWatching(rokuState);
  const record: StateRecord = {
    ...rokuState,
    watched
  };

  await appendStateRecord(record);

  const todayRecords = getTodayRecords(await readAllStateRecords());
  const usageMinutes = computeDailyUsageMinutes(todayRecords);
  const limitReached = usageMinutes >= config.dailyLimitMinutes;

  if (limitReached && rokuState.activeAppId !== config.roku.appId) {
    await launchRokuApp(config.roku.ip, config.roku.appId);
    return {
      limitReached,
      usageMinutes,
      action: 'launched-tv-time-app',
      record
    };
  }

  return {
    limitReached,
    usageMinutes,
    action: limitReached ? 'already-on-tv-time-app' : 'recorded-state',
    record
  };
}

export async function getStatusData() {
  const records = await readAllStateRecords();
  const today = new Date().toISOString().slice(0, 10);
  const todayRecords = records.filter((record) => record.timestamp.startsWith(today));
  const usageMinutes = computeDailyUsageMinutes(todayRecords);
  const lastRecord = records.length ? records[records.length - 1] : null;

  return {
    serverPort: config.serverPort,
    rokuIp: config.roku.ip,
    dailyLimitMinutes: config.dailyLimitMinutes,
    todayUsageMinutes: usageMinutes,
    todayRecords: todayRecords.length,
    powerState: lastRecord?.powerState || 'unknown',
    lastRecord
  };
}

export async function getTodayData() {
  const records = await readAllStateRecords();
  const today = new Date().toISOString().slice(0, 10);
  const todayRecords = records.filter((record) => record.timestamp.startsWith(today));

  // Enrich records with watched status
  const enrichedRecords = todayRecords.map((record) => ({
    ...record,
    watched: isWatching(record as RokuState)
  }));

  return {
    date: today,
    records: enrichedRecords
  };
}
