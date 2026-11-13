import type { CompareFacesCommandOutput } from '@aws-sdk/client-rekognition';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import type { SecretsService } from '../../../common/secrets/secrets.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { S3StorageService } from '../../files/files.public';
import type { AutoBarLookupProvider } from './bar-lookup/auto-bar-lookup.provider';
import { ManualIdVerificationProvider } from './manual.providers';
import {
  mapCompareFaces,
  RekognitionIdVerificationProvider,
  type CompareFacesClient,
} from './rekognition-id-verification.provider';
import { VerificationProviderSelector } from './verification-provider.selector';

const logger = {
  setContext: jest.fn(),
  warn: jest.fn(),
} as unknown as PinoLogger;

const file = (key: string, over: Record<string, unknown> = {}) => ({
  s3_bucket: 'lawbid-documents',
  s3_key: key,
  mime: 'image/jpeg',
  size_bytes: BigInt(400_000),
  scan_status: 'clean',
  deleted_at: null,
  ...over,
});

function build(opts: {
  client: CompareFacesClient;
  docs?: unknown[];
  endpoint?: string;
  threshold?: number;
}) {
  const docs = opts.docs ?? [
    { doc_type: 'selfie', side: null, file: file('verification_selfie/s1') },
    {
      doc_type: 'passport',
      side: 'front',
      file: file('verification_document/p1'),
    },
  ];
  const read = jest.fn().mockResolvedValue(Buffer.from('jpeg'));
  const provider = new RekognitionIdVerificationProvider(
    {
      verificationDocument: { findMany: jest.fn().mockResolvedValue(docs) },
    } as unknown as PrismaService,
    {
      number: jest.fn().mockResolvedValue(opts.threshold ?? 90),
    } as unknown as AppSettingsService,
    { get: jest.fn() } as unknown as SecretsService,
    {
      get: (k: string) => (k === 'S3_ENDPOINT' ? opts.endpoint : undefined),
    } as unknown as ConfigService,
    { read } as unknown as S3StorageService,
    logger,
    opts.client,
  );
  return { provider, read };
}

const input = { requestId: 'r1', attorneyId: 'a1' };
const face = (brightness = 80, sharpness = 80) => ({
  Confidence: 99.9,
  Quality: { Brightness: brightness, Sharpness: sharpness },
});
const out = (
  o: Partial<CompareFacesCommandOutput>,
): CompareFacesCommandOutput => ({
  $metadata: {},
  SourceImageFace: { Confidence: 99.9 },
  ...o,
});

describe('mapCompareFaces (row 52)', () => {
  it('one matching face at or above the threshold = pass with the similarity', () => {
    const r = mapCompareFaces(
      out({ FaceMatches: [{ Similarity: 98.765, Face: face() }] }),
      90,
    );
    expect(r).toEqual({
      result: 'pass',
      details: {
        provider: 'aws_rekognition',
        threshold: 90,
        similarity: 98.8,
        targetFaces: 1,
      },
    });
  });

  it('one face below the threshold = fail with selfie_mismatch', () => {
    const r = mapCompareFaces(out({ UnmatchedFaces: [face()] }), 90);
    expect(r.result).toBe('fail');
    expect(r.details).toMatchObject({
      reason: 'selfie_mismatch',
      similarity: null,
    });
  });

  it('row 60: a face below the threshold keeps its measured similarity', () => {
    const r = mapCompareFaces(
      out({ FaceMatches: [{ Similarity: 41.26, Face: face() }] }),
      90,
    );
    expect(r).toEqual({
      result: 'fail',
      details: {
        provider: 'aws_rekognition',
        reason: 'selfie_mismatch',
        threshold: 90,
        similarity: 41.3,
        targetFaces: 1,
      },
    });
  });

  it('row 60: a ghost image below the threshold next to a match = several_faces', () => {
    expect(
      mapCompareFaces(
        out({
          FaceMatches: [
            { Similarity: 97, Face: face() },
            { Similarity: 30, Face: face() },
          ],
        }),
        90,
      ),
    ).toMatchObject({
      result: 'manual_review',
      details: { reason: 'several_faces', similarity: 97 },
    });
  });

  it('a dark or blurry face is manual low_quality, not a mismatch', () => {
    expect(
      mapCompareFaces(out({ UnmatchedFaces: [face(5, 80)] }), 90),
    ).toMatchObject({
      result: 'manual_review',
      details: { reason: 'low_quality' },
    });
    expect(
      mapCompareFaces(
        out({ SourceImageFace: { Confidence: 50 }, FaceMatches: [] }),
        90,
      ),
    ).toMatchObject({
      result: 'manual_review',
      details: { reason: 'low_quality' },
    });
  });

  it('no face on the ID = manual no_face', () => {
    expect(mapCompareFaces(out({}), 90)).toMatchObject({
      result: 'manual_review',
      details: { reason: 'no_face' },
    });
  });

  it('several faces that do not all agree = manual several_faces', () => {
    expect(
      mapCompareFaces(
        out({
          FaceMatches: [{ Similarity: 99, Face: face() }],
          UnmatchedFaces: [face()],
        }),
        90,
      ),
    ).toMatchObject({
      result: 'manual_review',
      details: { reason: 'several_faces' },
    });
    expect(
      mapCompareFaces(out({ UnmatchedFaces: [face(), face()] }), 90),
    ).toMatchObject({
      result: 'manual_review',
      details: { reason: 'several_faces' },
    });
  });

  it('a ghost image that matched too is still a pass', () => {
    expect(
      mapCompareFaces(
        out({
          FaceMatches: [
            { Similarity: 99, Face: face() },
            { Similarity: 93, Face: face() },
          ],
        }),
        90,
      ).result,
    ).toBe('pass');
  });
});

describe('RekognitionIdVerificationProvider (fake Rekognition client)', () => {
  it('sends both images as private S3 object references with the admin threshold', async () => {
    const compareFaces = jest
      .fn()
      .mockResolvedValue(
        out({ FaceMatches: [{ Similarity: 97, Face: face() }] }),
      );
    const { provider, read } = build({
      client: { compareFaces },
      threshold: 92,
    });
    const r = await provider.matchFace(input);
    expect(r.result).toBe('pass');
    expect(compareFaces).toHaveBeenCalledWith({
      SourceImage: {
        S3Object: {
          Bucket: 'lawbid-documents',
          Name: 'verification_selfie/s1',
        },
      },
      TargetImage: {
        S3Object: {
          Bucket: 'lawbid-documents',
          Name: 'verification_document/p1',
        },
      },
      // Row 60: measured from 0 %, the admin threshold applied on our side.
      SimilarityThreshold: 0,
      QualityFilter: 'AUTO',
    });
    expect(read).not.toHaveBeenCalled();
    // Never a URL of any kind.
    expect(JSON.stringify(compareFaces.mock.calls)).not.toMatch(/https?:/);
  });

  it('when Rekognition cannot open the object, the private bytes are sent instead', async () => {
    const denied = Object.assign(new Error('no access'), {
      name: 'InvalidS3ObjectException',
    });
    const compareFaces = jest
      .fn()
      .mockRejectedValueOnce(denied)
      .mockResolvedValueOnce(out({ UnmatchedFaces: [face()] }));
    const { provider, read } = build({ client: { compareFaces } });
    const r = await provider.matchFace(input);
    expect(r).toMatchObject({
      result: 'fail',
      details: { reason: 'selfie_mismatch' },
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(compareFaces.mock.calls[1][0]).toMatchObject({
      SourceImage: { Bytes: Buffer.from('jpeg') },
    });
  });

  it('no face (InvalidParameterException) = manual no_face', async () => {
    const err = Object.assign(new Error('no faces'), {
      name: 'InvalidParameterException',
    });
    const { provider } = build({
      client: { compareFaces: jest.fn().mockRejectedValue(err) },
    });
    expect(await provider.matchFace(input)).toMatchObject({
      result: 'manual_review',
      details: { reason: 'no_face' },
    });
  });

  it('any other error = manual provider_error, never a pass', async () => {
    const { provider } = build({
      client: {
        compareFaces: jest.fn().mockRejectedValue(new Error('throttled')),
      },
    });
    expect(await provider.matchFace(input)).toMatchObject({
      result: 'manual_review',
      details: { provider: 'aws_rekognition', reason: 'provider_error' },
    });
  });

  it('a HEIC selfie, a missing ID or an unscanned file is not sent', async () => {
    const compareFaces = jest.fn();
    for (const [docs, reason] of [
      [
        [
          {
            doc_type: 'selfie',
            side: null,
            file: file('s', { mime: 'image/heic' }),
          },
          { doc_type: 'passport', side: 'front', file: file('p') },
        ],
        'unsupported_format',
      ],
      [[{ doc_type: 'selfie', side: null, file: file('s') }], 'image_missing'],
      [
        [
          {
            doc_type: 'selfie',
            side: null,
            file: file('s', { scan_status: 'pending' }),
          },
          { doc_type: 'state_id', side: 'front', file: file('p') },
        ],
        'file_not_clean',
      ],
    ] as const) {
      const { provider } = build({ client: { compareFaces }, docs: [...docs] });
      expect(await provider.matchFace(input)).toMatchObject({
        result: 'manual_review',
        details: { reason },
      });
    }
    expect(compareFaces).not.toHaveBeenCalled();
  });

  it('verify() stays a person: manual', async () => {
    const { provider } = build({ client: { compareFaces: jest.fn() } });
    expect((await provider.verify()).result).toBe('manual_review');
  });
});

describe('VerificationProviderSelector.faceMatch (switch «Сравнение лица (Amazon)»)', () => {
  const rek = {} as RekognitionIdVerificationProvider;
  const selector = (stored: string | Error) =>
    new VerificationProviderSelector(
      {} as AutoBarLookupProvider,
      new ManualIdVerificationProvider(),
      {
        string: () =>
          stored instanceof Error
            ? Promise.reject(stored)
            : Promise.resolve(stored),
      } as unknown as AppSettingsService,
      rek,
    );

  it.each([
    ['off', null],
    ['on', rek],
    ['auto', rek],
    ['typo', null],
  ])('%s → %p', async (stored, want) => {
    expect(await selector(stored).faceMatch()).toBe(want);
  });

  it('a failed settings read is off', async () => {
    expect(await selector(new Error('redis')).faceMatch()).toBeNull();
  });
});
