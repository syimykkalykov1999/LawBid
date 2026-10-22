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
  final resumedFrom = <String?>[];
  bool dropConnection = true;

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
    resumedFrom.add(resumeLocation);
    if (resumeLocation == null) onLocation?.call('https://tus.test/files/1');
    onProgress?.call(0.5);
    if (dropConnection) {
      throw DioException(
        requestOptions: RequestOptions(path: u.tusEndpoint),
        type: DioExceptionType.connectionError,
      );
    }
    onProgress?.call(1);
  }

  @override
  Future<void> cancel(String videoAssetId) async {}
}

class _Social extends FakeSocialRepository {
  final drafts = <PostDraft>[];

  @override
  Future<Post> createPost(PostDraft draft) async {
    drafts.add(draft);
    return fakePost('reel-post');
  }
}

/// Owner 2026-10-22 (audit #4 §3, Instagram): a reel being published is a
/// persistent queue job — the app closed mid-upload continues from Bunny's
/// saved TUS address on the next start, and the post is created once.
void main() {
  test('closed mid-upload: the next start resumes and publishes once',
      () async {
    final reels = _Reels();
    final social = _Social();
    final queueDb = UploadQueueDatabase(NativeDatabase.memory());
    addTearDown(queueDb.close);
    final dir = await Directory.systemTemp.createTemp('reel');
    addTearDown(() => dir.delete(recursive: true));
    final files = IoUploadFiles(root: () async => dir);
    final video = File('${dir.path}/picked.mp4')
      ..writeAsBytesSync(List<int>.filled(4096, 1));

    ProviderContainer container() {
      final c = ProviderContainer(
        overrides: uxOverrides(
          social: social,
          uploadQueue: uploadQueueOverrides(db: queueDb, files: files),
          extra: [
            reelsRepositoryProvider.overrideWithValue(reels),
            currentUserIdProvider.overrideWithValue('me'),
          ],
        ),
      );
      return c;
    }

    final first = container();
    final sub = first.listen(reelPublishJobProvider, (_, __) {});
    await first.read(reelPublishJobProvider.notifier).start(
          ReelPublishRequest(
            file: XFile(video.path),
            cut: const ReelCut(
              totalMs: 3000,
              startMs: 0,
              endMs: 3000,
              coverMs: 0,
            ),
            previewSize: const Size(720, 1280),
            title: 'Know your rights',
            text: '',
            place: '',
            commentsEnabled: true,
            photoIds: const [],
            attachments: const [],
          ),
        );
    await first.read(uploadQueueProvider).drain();
    final job = (await queueDb.pending('me')).single;
    expect(job.failedCode, isNull, reason: 'a dropped connection is retried');
    expect(job.progress, contains('https://tus.test/files/1'));
    // The app is killed.
    sub.close();
    first.dispose();

    reels.dropConnection = false;
    final second = container();
    addTearDown(second.dispose);
    second.read(reelPublishJobProvider);
    await second.read(uploadQueueProvider).drain();
    expect(reels.creates, 1, reason: "Bunny's upload slot is reused");
    // Only the very first try starts a new TUS upload; every later one
    // (a retry in the same run, the next start) continues it.
    expect(reels.resumedFrom.first, isNull);
    expect(
      reels.resumedFrom.skip(1),
      everyElement('https://tus.test/files/1'),
    );
    expect(social.drafts, hasLength(1));
    expect(social.drafts.single.idempotencyKey, job.id);
    expect(social.drafts.single.videoAssetId, 'asset-1');
    expect(await queueDb.pending('me'), isEmpty);
  });
}
