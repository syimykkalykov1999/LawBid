import type { File } from '../../../generated/prisma/client';

/**
 * M3 (owner 25.11, Slack / Telegram): a chat message may go while its file is
 * still checked. When the check ends, the chat that holds the message tells
 * everybody in it (the file appears, or turns into «removed»). The scan runs
 * in the worker, which has no chat module of its own to import: each chat
 * module provides its listener under one of these tokens, and the processor
 * finds them in the running app (`ModuleRef`, not strict). An app without
 * chats (a unit test) simply has none.
 */
export interface FileScanListener {
  fileScanEnded(
    file: Pick<File, 'id' | 'purpose' | 'owner_user_id'>,
    scanStatus: 'clean' | 'infected' | 'failed',
  ): Promise<void>;
}

export const CHAT_FILE_SCAN_LISTENER = 'files.scan-listener.chat';
export const GROUP_FILE_SCAN_LISTENER = 'files.scan-listener.group';
export const FILE_SCAN_LISTENER_TOKENS = [
  CHAT_FILE_SCAN_LISTENER,
  GROUP_FILE_SCAN_LISTENER,
] as const;

/** Purposes whose file can sit in a chat message before its check ended. */
export const CHAT_SCAN_PURPOSES: readonly File['purpose'][] = [
  'chat_attachment',
  'chat_voice',
];

/** How long a message waits for its file's check to be heard (the scanner
 * outage window is 24 h by default; then the page shows the state). */
export const SCAN_WAIT_TTL_SEC = 26 * 3600;

/** Redis key: the message that holds a file still being checked. */
export const scanWaitKey = (kind: 'chat' | 'group', fileId: string): string =>
  `${kind}:scanwait:${fileId}`;
