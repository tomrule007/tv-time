import axios from 'axios';

export interface RokuState {
  activeAppId: string;
  activeAppName: string;
  powerState: string;
  uptime: number;
  timestamp: string;
  rawResponse: string;
  deviceInfoRawResponse: string;
}

function parseActiveAppXml(xml: string): { id: string; name: string } {
  const appMatch = xml.match(/<app[^>]*id="([^"]+)"[^>]*>([^<]+)<\/app>/i);
  if (!appMatch) {
    return { id: 'unknown', name: 'Unknown' };
  }

  return {
    id: appMatch[1],
    name: appMatch[2].trim()
  };
}

function parsePowerStateXml(xml: string): string {
  const powerMatch = xml.match(/<power-mode>([^<]+)<\/power-mode>/i);
  if (!powerMatch) {
    return 'unknown';
  }

  return powerMatch[1].trim();
}

function parseUptimeXml(xml: string): number {
  const uptimeMatch = xml.match(/<uptime>([^<]+)<\/uptime>/i);
  if (!uptimeMatch) {
    return 0;
  }

  return parseInt(uptimeMatch[1].trim(), 10) || 0;
}

export async function getRokuState(rokuIp: string): Promise<RokuState> {
  const appUrl = `http://${rokuIp}:8060/query/active-app`;
  const deviceUrl = `http://${rokuIp}:8060/query/device-info`;

  const [appResponse, deviceResponse] = await Promise.all([
    axios.get<string>(appUrl, { timeout: 5000 }),
    axios.get<string>(deviceUrl, { timeout: 5000 })
  ]);

  const app = parseActiveAppXml(appResponse.data);
  const powerState = parsePowerStateXml(deviceResponse.data);
  const uptime = parseUptimeXml(deviceResponse.data);

  return {
    activeAppId: app.id,
    activeAppName: app.name,
    powerState: powerState,
    uptime: uptime,
    timestamp: new Date().toISOString(),
    rawResponse: appResponse.data,
    deviceInfoRawResponse: deviceResponse.data
  };
}

export async function launchRokuApp(rokuIp: string, appId: string): Promise<void> {
  const url = `http://${rokuIp}:8060/launch/${appId}`;
  await axios.post(url, null, { timeout: 5000 });
}
