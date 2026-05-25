import dgram from 'dgram';
import { networkInterfaces } from 'os';
import config from './config';

const SSDP_MULTICAST_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;

function getLocalIpAddress(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

export function startSsdpServer() {
  const server = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const localIp = getLocalIpAddress();
  const port = config.serverPort;

  server.on('error', (err) => {
    console.error('SSDP Server Error:', err);
    server.close();
  });

  server.on('message', (msg, rinfo) => {
    const message = msg.toString();

    // Respond to M-SEARCH requests
    if (message.includes('M-SEARCH')) {
      // The Roku app specifically looks for "upnp:rootdevice" or "ssdp:all"
      if (message.includes('ST: ssdp:all') || message.includes('ST: upnp:rootdevice')) {
        const response = [
          'HTTP/1.1 200 OK',
          'CACHE-CONTROL: max-age=1800',
          `ST: upnp:rootdevice`,
          `USN: uuid:tv-time-backend-${localIp}::upnp:rootdevice`,
          `LOCATION: http://${localIp}:${port}/ssdp/device-desc.xml`,
          'SERVER: Node.js/SSDP TV-TIME-Backend',
          '',
          ''
        ].join('\r\n');

        const responseBuffer = Buffer.from(response);
        server.send(responseBuffer, 0, responseBuffer.length, rinfo.port, rinfo.address, (err) => {
          if (err) console.error('Error sending SSDP response:', err);
        });
      }
    }
  });

  server.on('listening', () => {
    const address = server.address();
    console.log(`SSDP Responder listening on ${address.address}:${address.port}`);

    try {
      server.addMembership(SSDP_MULTICAST_ADDR);
      console.log(`Joined SSDP multicast group: ${SSDP_MULTICAST_ADDR}`);
    } catch (e) {
      console.error('Failed to join multicast group. SSDP discovery may not work.', e);
    }
  });

  // Bind to the wildcard address and standard SSDP port
  try {
    server.bind(SSDP_PORT);
  } catch (err) {
    if ((err as any).code === 'EADDRINUSE') {
      console.warn(`Port ${SSDP_PORT} in use. SSDP discovery might be handled by another process.`);
    } else {
      console.error('Failed to bind SSDP port:', err);
    }
  }
}