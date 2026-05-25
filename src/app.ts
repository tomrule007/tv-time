import path from 'path';
import express from 'express';
import statusRouter from './routes/status';
import { getDailyLimitStatus } from './tvTime';
import config from './config';

const app = express();

app.use(express.json());

// Serve static files from public directory
const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath));

// API routes
app.use('/api/status', statusRouter);

// SSDP Device Description (required for automatic discovery)
app.get('/ssdp/device-desc.xml', (req, res) => {
  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
    <specVersion><major>1</major><minor>0</minor></specVersion>
    <device>
        <friendlyName>TV-TIME Backend</friendlyName>
        <modelName>tv-time</modelName>
    </device>
</root>`);
});

// Health check endpoint used by Roku discovery fallback
app.get('/api/status/limit', async (req, res) => {
  res.json(await getDailyLimitStatus());
});

app.post('/api/config/toggle-exempt', (req, res) => {
  const { appId } = req.body;
  if (!appId || appId.toLowerCase() === 'unknown') {
    return res.status(400).json({ error: 'Valid appId is required' });
  }

  const index = config.exemptAppIds.findIndex(id => id.toLowerCase() === appId.toLowerCase());
  if (index > -1) {
    config.exemptAppIds.splice(index, 1);
    res.json({ message: `App ${appId} removed from exempt list`, exemptAppIds: config.exemptAppIds });
  } else {
    config.exemptAppIds.push(appId);
    res.json({ message: `App ${appId} added to exempt list`, exemptAppIds: config.exemptAppIds });
  }
});

app.get('/api', (req, res) => {
  res.json({
    service: 'TV-TIME backend',
    version: '0.1.0',
    message: 'API endpoints: /api/status (current status), /api/status/today (daily records)'
  });
});

// Serve index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

export default app;
