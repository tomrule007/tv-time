const config = {
  serverPort: Number(process.env.PORT) || 3000,
  roku: {
    ip: process.env.ROKU_IP || '192.168.0.52',
    appId: process.env.ROKU_APP_ID || 'dev',
    launchPath: process.env.ROKU_LAUNCH_PATH || '/launch'
  },
  dailyLimitMinutes: 90,
  // Schedule for per-day limits (Sunday-Saturday). Leave as undefined to use dailyLimitMinutes for all days
  schedule: {
    0: undefined as number | undefined, // Sunday
    1: undefined as number | undefined, // Monday
    2: undefined as number | undefined, // Tuesday
    3: undefined as number | undefined, // Wednesday
    4: undefined as number | undefined, // Thursday
    5: undefined as number | undefined, // Friday
    6: undefined as number | undefined  // Saturday
  },
  pollIntervalMs: 30_000,
  stateLogPath: 'data/state.log',
  exemptAppIds: [] as string[]
};

export function getDayLimit(dateTime: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long'
  }).formatToParts(dateTime);
  
  const dayName = parts.find((part) => part.type === 'weekday')?.value || '';
  const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(dayName);
  
  if (dayOfWeek >= 0 && dayOfWeek <= 6) {
    const limit = config.schedule[dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6];
    if (limit !== undefined) {
      return limit;
    }
  }
  
  return config.dailyLimitMinutes;
}

export default config;
