import type { PinoLogger } from 'nestjs-pino';
import type { ModuleRef } from '@nestjs/core';
import { FileScanProcessor } from './file-scan.processor';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { S3StorageService } from '../storage/s3-storage.service';
import type { ImageProcessor } from '../processing/image-processor';
import type { RealtimePublisher } from '../../realtime/realtime-publisher.service';
import { DevEicarScanner, EICAR_SIGNATURE } from '../scanning/virus-scanner';
import {
  CHAT_FILE_SCAN_LISTENER,
  GROUP_FILE_SCAN_LISTENER,
} from './scan-listeners';

/**
 * M3 (owner 25.11, Slack / Telegram): when the check of a chat file ends,
 * the chats that already hold a message with it are told (clean → the file
 * appears for the others; infected → «removed» for everyone). Before M3 only
 * the uploader heard `file:ready`.
 */
function make(purpose: string, data: Buffer, withChats = true) {
  const row = {
    id: 'f1',
    owner_user_id: 'u1',
    purpose,
    scan_status: 'pending',
    s3_bucket: 'b',
    s3_key: 'k',
    size_bytes: BigInt(data.length),
    source_sha256: 'x',
  };
  const prisma = {
    file: {
      findUnique: jest.fn().mockResolvedValue(row),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const storage = {
    read: jest.fn().mockResolvedValue(data),
    remove: jest.fn(),
    put: jest.fn(),
    isPublicStoreBucket: jest.fn().mockReturnValue(false),
  };
  const images = {
    process: jest.fn().mockResolvedValue({
      main: null,
      variants: new Map(),
      width: null,
      height: null,
    }),
  };
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const realtime = { toUsers: jest.fn() };
  const chat = { fileScanEnded: jest.fn().mockResolvedValue(undefined) };
  const group = { fileScanEnded: jest.fn().mockResolvedValue(undefined) };
  const moduleRef = {
    get: jest.fn((token: string) => {
      if (!withChats) throw new Error('not found');
      if (token === CHAT_FILE_SCAN_LISTENER) return chat;
      if (token === GROUP_FILE_SCAN_LISTENER) return group;
      throw new Error('not found');
    }),
  };
  const processor = new FileScanProcessor(
    prisma as unknown as PrismaService,
    storage as unknown as S3StorageService,
    images as unknown as ImageProcessor,
    new DevEicarScanner(),
    logger as unknown as PinoLogger,
    undefined,
    undefined,
    undefined,
    realtime as unknown as RealtimePublisher,
    undefined,
    moduleRef as unknown as ModuleRef,
  );
  return { processor, chat, group, realtime, moduleRef };
}

const flush = () => new Promise((r) => setImmediate(r));
const PDF = Buffer.from('%PDF-1.4 clean');

describe('FileScanProcessor → chats (M3)', () => {
  it('a clean chat file: the uploader hears file:ready and both chats are told', async () => {
    const { processor, chat, group, realtime } = make('chat_attachment', PDF);
    expect(await processor.run('f1', false)).toBe('clean');
    await flush();
    expect(realtime.toUsers).toHaveBeenCalledWith(['u1'], 'file:ready', {
      fileId: 'f1',
      scanStatus: 'clean',
    });
    expect(chat.fileScanEnded).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'f1', purpose: 'chat_attachment' }),
      'clean',
    );
    expect(group.fileScanEnded).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'f1' }),
      'clean',
    );
  });

  it('an infected chat voice note: the chats are told «infected»', async () => {
    const { processor, chat } = make(
      'chat_voice',
      Buffer.from(`OggS ${EICAR_SIGNATURE}`),
    );
    expect(await processor.run('f1', false)).toBe('infected');
    await flush();
    expect(chat.fileScanEnded).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'f1', purpose: 'chat_voice' }),
      'infected',
    );
  });

  it('other purposes never reach the chats', async () => {
    const { processor, chat, moduleRef } = make('verification_document', PDF);
    expect(await processor.run('f1', false)).toBe('clean');
    await flush();
    expect(moduleRef.get).not.toHaveBeenCalled();
    expect(chat.fileScanEnded).not.toHaveBeenCalled();
  });

  it('an app without chats (no listeners) still finishes the scan', async () => {
    const { processor, realtime } = make('chat_attachment', PDF, false);
    expect(await processor.run('f1', false)).toBe('clean');
    await flush();
    expect(realtime.toUsers).toHaveBeenCalledWith(['u1'], 'file:ready', {
      fileId: 'f1',
      scanStatus: 'clean',
    });
  });

  it('a failing chat listener is logged, the other one still runs', async () => {
    const { processor, chat, group } = make('chat_attachment', PDF);
    chat.fileScanEnded.mockRejectedValueOnce(new Error('db down'));
    expect(await processor.run('f1', false)).toBe('clean');
    await flush();
    expect(group.fileScanEnded).toHaveBeenCalled();
  });
});
