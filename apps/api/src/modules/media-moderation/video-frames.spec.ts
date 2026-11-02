import {
  extractFrame,
  FfmpegMissingError,
  frameArgs,
  frameTimesSec,
} from './video-frames';

describe('frameTimesSec', () => {
  it('spreads the frames over equal slices of the clip (midpoints)', () => {
    expect(frameTimesSec(30, 10, 6)).toEqual([5, 15, 25]);
  });

  it('a short clip still gets one frame in the middle', () => {
    expect(frameTimesSec(4, 10, 6)).toEqual([2]);
  });

  it('is capped by the maximum', () => {
    expect(frameTimesSec(600, 10, 6)).toHaveLength(6);
    expect(frameTimesSec(600, 10, 6)[5]).toBeCloseTo(550, 1);
  });

  it('nothing to grab without a duration or a limit', () => {
    expect(frameTimesSec(0, 10, 6)).toEqual([]);
    expect(frameTimesSec(30, 0, 6)).toEqual([]);
    expect(frameTimesSec(30, 10, 0)).toEqual([]);
  });
});

describe('extractFrame', () => {
  it('limits ffmpeg to https and seeks before the input', () => {
    const a = frameArgs('https://cdn.example/v/play_720p.mp4', 12.5);
    expect(a[a.indexOf('-protocol_whitelist') + 1]).toBe(
      'https,tls,tcp,crypto',
    );
    expect(a.indexOf('-ss')).toBeLessThan(a.indexOf('-i'));
    expect(a[a.indexOf('-ss') + 1]).toBe('12.5');
    expect(a[a.indexOf('-i') + 1]).toBe('https://cdn.example/v/play_720p.mp4');
  });

  it('refuses anything but an https url', async () => {
    await expect(extractFrame('file:///etc/passwd', 1)).rejects.toThrow(
      /https/,
    );
    await expect(extractFrame('http://cdn.example/v.mp4', 1)).rejects.toThrow(
      /https/,
    );
  });

  it('a missing binary is FfmpegMissingError, not a crash', async () => {
    await expect(
      extractFrame('https://cdn.example/v.mp4', 1, '/nonexistent/ffmpeg'),
    ).rejects.toBeInstanceOf(FfmpegMissingError);
  });
});
