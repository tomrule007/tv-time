import fs from 'fs/promises';
import path from 'path';
import config from './config';
import { readAllStateRecords } from './db';

/**
 * Migrate old state records to include pollTime field.
 * For records without pollTime, calculates it based on delta from previous record.
 */
export async function migratePollTime(): Promise<void> {
  const stateFile = path.resolve(process.cwd(), config.stateLogPath);

  console.log('Starting pollTime migration...');

  try {
    const records = await readAllStateRecords();

    if (records.length === 0) {
      console.log('No records to migrate.');
      return;
    }

    // Sort by timestamp
    const sorted = [...records].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let migratedCount = 0;

    // Add pollTime to records that don't have it
    const migratedRecords = sorted.map((record, index) => {
      if (record.pollTime !== undefined) {
        return record;
      }

      let pollTime: number;

      if (index === 0) {
        // First record defaults to config pollInterval
        pollTime = config.pollIntervalMs;
      } else {
        // Calculate delta from previous record
        const prevTime = new Date(sorted[index - 1].timestamp).getTime();
        const currTime = new Date(record.timestamp).getTime();
        pollTime = currTime - prevTime;
      }

      migratedCount++;
      return { ...record, pollTime };
    });

    // Write migrated records back to state.log
    const lines = migratedRecords.map((record) => JSON.stringify(record)).join('\n') + '\n';
    await fs.writeFile(stateFile, lines, { encoding: 'utf8' });

    console.log(`Migration complete. Updated ${migratedCount} records with pollTime.`);
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if this is the entry point
if (process.argv[1] === __filename) {
  migratePollTime()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
