// VORA V1 STUB: Cron service removed
export class CronService {
  constructor() {}
  start(): Promise<void> { return Promise.resolve(); }
  stop(): Promise<void> { return Promise.resolve(); }
  listJobs(): unknown[] { return []; }
  addJob(): Promise<void> { return Promise.resolve(); }
  removeJob(): Promise<void> { return Promise.resolve(); }
  getJob(): null { return null; }
  getNextRun(): null { return null; }
  isRunning(): boolean { return false; }
}
export function startCronService(): Promise<void> { return Promise.resolve(); }
export function stopCronService(): Promise<void> { return Promise.resolve(); }
export function getCronService(): CronService { return new CronService(); }
