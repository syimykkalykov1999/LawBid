import 'dart:io';

import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart' show Size;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/uploads/upload_files_io.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/core/uploads/upload_queue_database.dart';
import 'package:lawbid/features/reels/application/reel_publish_job.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/data/reels_repository.dart';
import 'package:lawbid/features/reels/domain/reel_cut.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

import '../../helpers/upload_queue_overrides.dart';
import '../../helpers/ux_harness.dart';
import '../social/social_fakes.dart';

class _Reels extends ReelsRepository {
  _Reels() : super(apiDio: Dio(), storageDio: Dio());

  int creates = 0;
  int uploads = 0;
  final cancelled = <String>[];

  @override
  Future<ReelUpload> createUpload({
    required int sizeBytes,
    required int durationSec,
    String? title,
    int? trimStartMs,
    int? trimEndMs,
    int? coverTimeMs,
    String? coverFileId,
  }) async {
    creates++;
    return const ReelUpload(
      videoAssetId: 'asset-1',
      tusEndpoint: 'https://tus.test/files',
      libraryId: 'lib',
      videoId: 'vid',
      signature: 'sig',
      expire: 9999999999,
      maxDurationSec: 90,
    );
  }

  @override
  Future<void> upload(
    XFile file,
    ReelUpload u, {
    void Function(double)? onProgress,
    CancelToken? cancel,
    String? resumeLocation,
    void Function(String location)? onLocation,
  }) async {
    uploads++;
    onLocation?.call('https://tus.test/files/1');
    onProgress?.call(1);
  }

  @override
  Future<void> cancel(String videoAssetId) async => cancelled.add(videoAssetId);
}

class _Social extends FakeSocialRepository {
  final drafts = <PostDraft>[];

  @override
  Future<Post> createPost(PostDraft draft) async {
    drafts.add(draft);
    return fakePost('reel-post');
  }
}

const _cut = ReelCut(totalMs: 3000, startMs: 0, endMs: 3000, coverMs: 0);

/// R-396 (owner 2026-11-04, «в Инсте не так»): the picked video uploads
/// while the caption is typed; «Publish» only creates the post.
void main() {
  late _Reels reels;
  late _Social social;
  late UploadQueueDatabase queueDb;
  late IoUploadFiles files;
  late File video;

  setUp(() async {
    reels = _Reels();
    social = _Social();
    queueDb = UploadQueueDatabase(NativeDatabase.memory());
    addTearDown(queueDb.close);
    final dir = await Directory.systemTemp.createTemp('reel-draft');
    addTearDown(() => dir.delete(recursive: true));
    files = IoUploadFiles(root: () async => dir);
    video = File('${dir.path}/picked.mp4')
      ..writeAsBytesSync(List<int>.filled(4096, 1));
  });

  ProviderContainer container() {
    return ProviderContainer(
      overrides: uxOverrides(
        social: social,
        uploadQueue: uploadQueueOverrides(db: queueDb, files: files),
        extra: [
          reelsRepositoryProvider.overrideWithValue(reels),
          currentUserIdProvider.overrideWithValue('me'),
        ],
      ),
    )..listen(reelPublishJobProvider, (_, __) {});
  }

  Future<void> until(Future<bool> Function() done) async {
    for (var i = 0; i < 400; i++) {
      if (await done()) return;
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    fail('timed out');
  }

  Future<bool> uploaded() async {
    final rows = await queueDb.pending('me');
    return rows.length == 1 && rows.single.progress.contains('"uploaded"');
  }

  ReelPublishRequest request() => ReelPublishRequest(
        file: XFile(video.path),
        cut: _cut,
        previewSize: const Size(720, 1280),
        title: '',
        text: 'Know your rights',
        place: 'Bishkek',
        commentsEnabled: true,
        photoIds: const [],
        attachments: const [],
      );

  String draft(ProviderContainer c) =>
      c.read(reelPublishJobProvider.notifier).startDraft(
            file: XFile(video.path),
            cut: _cut,
            previewSize: const Size(720, 1280),
          )!;

  test('picked: uploads ahead, no post and no card until «Publish»', () async {
    final c = container();
    addTearDown(c.dispose);
    draft(c);
    await until(uploaded);
    // Drained again (the app came to the front): still waiting.
    await c.read(uploadQueueProvider).drain();
    expect(reels.creates, 1);
    expect(reels.uploads, 1);
    expect(social.drafts, isEmpty);
    expect(c.read(reelPublishJobProvider).phase, ReelPublishPhase.idle);
  });

  test('«Publish» after the upload: only the post is created', () async {
    final c = container();
    addTearDown(c.dispose);
    final id = draft(c);
    await until(uploaded);
    await c.read(reelPublishJobProvider.notifier).publishDraft(id, request());
    await until(() async => (await queueDb.pending('me')).isEmpty);
    expect(reels.creates, 1, reason: 'no second upload slot');
    expect(reels.uploads, 1, reason: 'the bytes are not sent again');
    expect(social.drafts, hasLength(1));
    expect(social.drafts.single.idempotencyKey, id);
    expect(social.drafts.single.videoAssetId, 'asset-1');
    expect(social.drafts.single.body, 'Know your rights');
    expect(social.drafts.single.locationName, 'Bishkek');
    expect(reels.cancelled, isEmpty);
  });

  test('«Publish» while it still uploads: posted once when done', () async {
    final c = container();
    addTearDown(c.dispose);
    final id = draft(c);
    await c.read(reelPublishJobProvider.notifier).publishDraft(id, request());
    await until(() async => (await queueDb.pending('me')).isEmpty);
    expect(reels.creates, 1);
    expect(social.drafts, hasLength(1));
    expect(social.drafts.single.idempotencyKey, id);
  });

  test('the video removed: the draft and its Bunny upload go', () async {
    final c = container();
    addTearDown(c.dispose);
    final job = c.read(reelPublishJobProvider.notifier);
    final id = draft(c);
    await until(uploaded);
    job.discardDraft(id);
    await until(() async => (await queueDb.pending('me')).isEmpty);
    await until(() async => reels.cancelled.isNotEmpty);
    expect(reels.cancelled, ['asset-1']);
    expect(social.drafts, isEmpty);
    expect(job.draftId, isNull);
    expect(c.read(reelPublishJobProvider).phase, ReelPublishPhase.idle);
  });

  test('a draft left by a killed app is dropped at the next start', () async {
    final first = container();
    draft(first);
    await until(uploaded);
    first.dispose();

    final second = container();
    addTearDown(second.dispose);
    await until(() async => (await queueDb.pending('me')).isEmpty);
    await until(() async => reels.cancelled.isNotEmpty);
    expect(reels.cancelled, ['asset-1']);
    expect(social.drafts, isEmpty);
    expect(second.read(reelPublishJobProvider).phase, ReelPublishPhase.idle);
  });
}
