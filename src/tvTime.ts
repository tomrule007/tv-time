import config, { getDayLimit } from './config';
import { getRokuState, launchRokuApp, RokuState } from './roku';
import { appendStateRecord, readAllStateRecords, StateRecord } from './db';

function isWatching(state: RokuState): boolean {
  return !isHomeScreen(state) && !isTvTimeApp(state) && state.activeAppId.toLowerCase() !== 'unknown' && state.powerState !== 'PowerOff';
}

function isHomeScreen(state: RokuState): boolean {
  return state.activeAppName.toLowerCase() === 'home';
}

function isTvTimeApp(state: RokuState): boolean {
  const activeId = state.activeAppId.toLowerCase();
  const activeName = state.activeAppName.toLowerCase();
  const configuredAppId = config.roku.appId.toLowerCase();
  return (
    activeId === configuredAppId ||
    activeId === 'dev' ||
    activeName.includes('tv-time')
  );
}

function shouldLaunchLimitApp(state: RokuState, limitReached: boolean): boolean {
  return limitReached && !isHomeScreen(state) && !isTvTimeApp(state);
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
  const byApp: Record<string, number> = {};
  let totalMinutes = 0;

  for (const record of records) {
    // Re-compute watched status using centralized exclusion logic to ensure consistency
    const isCurrentlyWatching = isWatching(record as RokuState);
    
    if (isCurrentlyWatching) {
      const pollTimeMinutes = (record.pollTime || config.pollIntervalMs) / 60000;
      totalMinutes += pollTimeMinutes;
      const appName = record.activeAppName || 'Unknown';
      byApp[appName] = (byApp[appName] || 0) + pollTimeMinutes;
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
  // TODO: Implement gap detection if needed in the future
  return [];
}

export async function pollAndEvaluateCurrentState() {
  const rokuState = await getRokuState(config.roku.ip);
  const watched = isWatching(rokuState);
  const record: StateRecord = {
    ...rokuState,
    watched,
    pollTime: config.pollIntervalMs
  };

  await appendStateRecord(record);

  const todayRecords = getTodayRecords(await readAllStateRecords());
  const timeZone = getDeviceTimeZone(todayRecords);
  const usageMinutes = computeDailyUsageMinutes(todayRecords);
  const dayLimit = getDayLimit(new Date(), timeZone);
  const limitReached = usageMinutes >= dayLimit;

  if (shouldLaunchLimitApp(rokuState, limitReached)) {
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
    action: limitReached ? 'limit-reached-no-launch-needed' : 'recorded-state',
    record
  };
}

export async function getStatusData() {
  const records = await readAllStateRecords();
  const timeZone = getDeviceTimeZone(records);
  const today = toLocalDateKey(new Date(), timeZone);
  const todayRecords = getTodayRecords(records);
  const usageMinutes = computeDailyUsageMinutes(todayRecords);
  const dayLimit = getDayLimit(new Date(), timeZone);
  const lastRecord = records.length ? records[records.length - 1] : null;

  return {
    serverPort: config.serverPort,
    rokuIp: config.roku.ip,
    timeZone,
    dailyLimitMinutes: dayLimit,
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
  const dayLimit = getDayLimit(new Date(), timeZone);

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
    dailyLimitMinutes: dayLimit,
    todayUsageMinutes: Math.round(usage.totalMinutes),
    appUsage: usage.byApp,
    dataGaps: detectDataGaps(enrichedRecords),
    records: enrichedRecords
  };
}

export async function getDailyLimitStatus() {
  const records = await readAllStateRecords();
  const todayRecords = getTodayRecords(records);
  const timeZone = getDeviceTimeZone(todayRecords);
  const usageMinutes = computeDailyUsageMinutes(todayRecords);
  const limitMinutes = getDayLimit(new Date(), timeZone);
  const limitExceeded = usageMinutes >= limitMinutes;

  return {
    todayUsageMinutes: usageMinutes,
    dailyLimitMinutes: limitMinutes,
    limitExceeded
  };
}
