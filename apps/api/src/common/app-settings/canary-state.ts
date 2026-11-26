/**
 * Б3: is this process one of the canary API tasks (config-canary.ts sets
 * it on every heartbeat)? A file with no imports, so AppConfigService can
 * read it without an import cycle. False in every process without the
 * cohort service (workers, jobs, specs): they read the old values of a
 * setting change under watch.
 */
let canaryProcess = false;

export function isCanaryProcess(): boolean {
  return canaryProcess;
}

export function setCanaryProcess(on: boolean): void {
  canaryProcess = on;
}
