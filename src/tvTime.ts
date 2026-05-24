import config from './config';
import { getRokuState, launchRokuApp, RokuState } from './roku';
import { appendStateRecord, readAllStateRecords, StateRecord } from './db';

function isWatching(state: RokuState): boolean {
  const activeId = state.activeAppId.toLowerCase();
  const activeName = state.activeAppName.toLowerCase();
  const configuredAppId = config.roku.appId.toLowerCase();
  if (
    activeId === configuredAppId ||
    activeId === 'dev' ||
    activeName === 'home' ||
    activeName.includes('tv-time')
  ) {
    return false;
  }
  return activeId !== 'unknown' && state.powerState !== 'PowerOff';
}

function getTodayRecords(records: StateRecord[]): StateRecord[] {
  const timeZone = getDeviceTimeZone(records);
  const today = toLocalDateKey(new Date(), timeZone);
  return records.filter((record) => toLocalDateKey(new Date(record.timestamp), timeZone) === today);
}

function getDeviceTimeZone(records: StateRecord[]): string {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const raw = records[i].deviceInfoRawResponse || '';
    const match = raw.match(/<time-zone-tz>([^<]+)<\/time-zone-tz>/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function toLocalDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

function computeDailyUsageMinutes(records: StateRecord[]): number {
  return Math.round(computeUsageByApp(records).totalMinutes);
}

function computeUsageByApp(records: StateRecord[]) {
  const ordered = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const byApp: Record<string, number> = {};
  let totalMinutes = 0;

  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    const previousTime = new Date(previous.timestamp).getTime();
    const currentTime = new Date(current.timestamp).getTime();
    const deltaMs = currentTime - previousTime;
    const deltaMinutes = deltaMs / 60000;

    if (deltaMs > getGapThresholdMs()) {
      continue;
    }

    if (previous.watched) {
      totalMinutes += deltaMinutes;
      const appName = previous.activeAppName || 'Unknown';
      byApp[appName] = (byApp[appName] || 0) + deltaMinutes;
    }
  }

  return {
    totalMinutes,
    byApp: Object.entries(byApp)
      .map(([appName, minutes]) => ({ appName, minutes: Math.round(minutes) }))
      .sort((a, b) => b.minutes - a.minutes)
  };
}

function detectDataGaps(records: StateRecord[]) {
  const ordered = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const thresholdMs = getGapThresholdMs();
  const gaps = [];

  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    const startMs = new Date(previous.timestamp).getTime();
    const endMs = new Date(current.timestamp).getTime();
    const durationMs = endMs - startMs;

    if (durationMs > thresholdMs) {
      gaps.push({
        start: previous.timestamp,
        end: current.timestamp,
        minutes: Math.round(durationMs / 60000)
      });
    }
  }

  return gaps;
}

function getGapThresholdMs(): number {
  return config.pollIntervalMs * 2.5;
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
  const timeZone = getDeviceTimeZone(records);
  const today = toLocalDateKey(new Date(), timeZone);
  const todayRecords = getTodayRecords(records);
  const usageMinutes = computeDailyUsageMinutes(todayRecords);
  const lastRecord = records.length ? records[records.length - 1] : null;

  return {
    serverPort: config.serverPort,
    rokuIp: config.roku.ip,
    timeZone,
    dailyLimitMinutes: config.dailyLimitMinutes,
    todayUsageMinutes: usageMinutes,
    todayRecords: todayRecords.length,
    powerState: lastRecord?.powerState || 'unknown',
    lastRecord
  };
}

export async function getTodayData() {
  const records = await readAllStateRecords();
  const timeZone = getDeviceTimeZone(records);
  const today = toLocalDateKey(new Date(), timeZone);
  const todayRecords = getTodayRecords(records);

  // Enrich records with watched status
  const enrichedRecords = todayRecords.map((record) => ({
    ...record,
    watched: isWatching(record as RokuState)
  }));

  const usage = computeUsageByApp(enrichedRecords);

  return {
    date: today,
    timeZone,
    currentTime: new Date().toISOString(),
    todayUsageMinutes: Math.round(usage.totalMinutes),
    appUsage: usage.byApp,
    dataGaps: detectDataGaps(enrichedRecords),
    records: enrichedRecords
  };
}

export async function getDailyLimitStatus() {
  const records = await readAllStateRecords();
  const todayRecords = getTodayRecords(records);
  const usageMinutes = computeDailyUsageMinutes(todayRecords);
  const limitMinutes = config.dailyLimitMinutes;
  const limitExceeded = usageMinutes >= limitMinutes;

  return {
    todayUsageMinutes: usageMinutes,
    dailyLimitMinutes: limitMinutes,
    limitExceeded
  };
}
