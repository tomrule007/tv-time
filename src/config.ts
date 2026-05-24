const config = {
  serverPort: Number(process.env.PORT) || 3000,
  roku: {
    ip: process.env.ROKU_IP || '192.168.0.52',
    appId: process.env.ROKU_APP_ID || 'tvtime',
    launchPath: process.env.ROKU_LAUNCH_PATH || '/launch'
  },
  dailyLimitMinutes: 120,
  pollIntervalMs: 30_000,
  stateLogPath: 'data/state.log'
};

export default config;
