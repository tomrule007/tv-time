import fs from 'fs/promises';
import path from 'path';
import config from './config';
import { RokuState } from './roku';

export interface StateRecord extends RokuState {
  watched: boolean;
  pollTime?: number; // Poll interval in milliseconds
}

const stateFile = path.resolve(process.cwd(), config.stateLogPath);

export async function appendStateRecord(record: StateRecord): Promise<void> {
  const line = JSON.stringify(record) + '\n';
  await fs.appendFile(stateFile, line, { encoding: 'utf8' });
}

export async function readAllStateRecords(): Promise<StateRecord[]> {
  try {
    const contents = await fs.readFile(stateFile, 'utf8');
    return contents
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StateRecord);
  } catch (error) {
    return [];
  }
}
