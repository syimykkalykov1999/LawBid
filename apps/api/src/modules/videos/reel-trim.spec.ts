import { playedSec, reelTrim } from './videos.service';
import { safeFileName } from '../posts/posts.service';
import { contentDisposition } from '../files/storage/s3-storage.service';
import {
  videoCallAvailability,
  WebRtcVideoProvider,
} from '../calls/video-call-provider';

describe('owner 2026-10-05: reels, documents, video calls', () => {
  describe('reelTrim', () => {
    it('no trim: the whole video, refused above the reel limit', () => {
      expect(reelTrim({ durationSec: 60 }, 90)).toBeNull();
      expect(reelTrim({ durationSec: 91 }, 90)).toBe('too_long');
    });

    it('a ≤ 90 s part of a longer source', () => {
      expect(
        reelTrim(
          { durationSec: 150, trimStartMs: 20_000, trimEndMs: 95_000 },
          90,
        ),
      ).toEqual({ startMs: 20_000, endMs: 95_000 });
      // The end defaults to the end of the video.
      expect(reelTrim({ durationSec: 100, trimStartMs: 30_000 }, 90)).toEqual({
        startMs: 30_000,
        endMs: 100_000,
      });
    });

    it('refuses a part longer than the limit, empty, reversed or < 1 s', () => {
      expect(
        reelTrim({ durationSec: 150, trimStartMs: 0, trimEndMs: 120_000 }, 90),
      ).toBe('too_long');
      expect(
        reelTrim(
          { durationSec: 60, trimStartMs: 30_000, trimEndMs: 20_000 },
          90,
        ),
      ).toBe('invalid');
      expect(
        reelTrim(
          { durationSec: 60, trimStartMs: 10_000, trimEndMs: 10_500 },
          90,
        ),
      ).toBe('invalid');
      expect(reelTrim({ durationSec: 60, trimStartMs: 70_000 }, 90)).toBe(
        'invalid',
      );
    });
  });

  it('playedSec: the trimmed length, else the whole', () => {
    const base = { trim_start_ms: null, trim_end_ms: null };
    expect(playedSec({ duration_sec: 40, ...base })).toBe(40);
    expect(
      playedSec({
        duration_sec: 150,
        trim_start_ms: 20_000,
        trim_end_ms: 95_000,
      }),
    ).toBe(75);
    // Bunny says the video is shorter than the phone thought.
    expect(
      playedSec({
        duration_sec: 50,
        trim_start_ms: 20_000,
        trim_end_ms: 95_000,
      }),
    ).toBe(30);
  });

  it('safeFileName drops paths and control characters', () => {
    expect(safeFileName('../../etc/Lease.pdf')).toBe('Lease.pdf');
    expect(safeFileName('C:\\Docs\\Будь.docx')).toBe('Будь.docx');
    expect(safeFileName('a\u0000b\n.txt')).toBe('ab.txt');
    expect(safeFileName('  /  ')).toBe('document');
  });

  it('contentDisposition keeps the UTF-8 name and an ASCII fallback', () => {
    expect(contentDisposition('Договор "1".pdf')).toBe(
      `attachment; filename="_______ _1_.pdf"; filename*=UTF-8''${encodeURIComponent('Договор "1".pdf')}`,
    );
  });

  describe('video call availability', () => {
    const provider = (
      env: string,
      turn: Record<string, string> | null,
    ): WebRtcVideoProvider =>
      new WebRtcVideoProvider(
        {
          get: () =>
            Promise.resolve(
              turn ? ({ fields: turn } as unknown as never) : null,
            ),
        },
        { get: (k: string) => (k === 'NODE_ENV' ? env : undefined) },
      );

    it('off while the flag is off', async () => {
      await expect(
        videoCallAvailability(false, provider('production', null)),
      ).resolves.toEqual({ available: false, reason: 'flag_off' });
    });

    it('production needs TURN', async () => {
      await expect(
        videoCallAvailability(true, provider('production', null)),
      ).resolves.toEqual({
        available: false,
        reason: 'provider_not_configured',
      });
      await expect(
        videoCallAvailability(
          true,
          provider('production', { urls: 'turn:t.example:3478', secret: 's' }),
        ),
      ).resolves.toEqual({ available: true, reason: null });
    });

    it('development works on STUN alone', async () => {
      await expect(
        videoCallAvailability(true, provider('development', null)),
      ).resolves.toEqual({ available: true, reason: null });
    });
  });
});
