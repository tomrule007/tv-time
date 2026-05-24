import express from 'express';
import { getStatusData, getTodayData } from '../tvTime';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const status = await getStatusData();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Unable to retrieve status', details: String(error) });
  }
});

router.get('/today', async (req, res) => {
  try {
    const data = await getTodayData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Unable to retrieve today data', details: String(error) });
  }
});

export default router;
