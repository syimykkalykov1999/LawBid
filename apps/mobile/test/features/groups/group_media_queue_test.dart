import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/media/video_compression.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart'
    show isRecordedVideo, markRecordedVideo;
import 'package:lawbid/features/groups/application/group_media_outbox.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/upload_queue_overrides.dart';
import 'fake_group_repository.dart';

const _key = (groupId: 'g1', topicId: null);

/// The phone's encoder: a smaller MP4 next to the source.
class _Encoder implements VideoCompressor {
  int calls = 0;

  @override
  Future<XFile?> compress(
    XFile source, {
    required VideoLimits limits,
    void Function(double progress)? onProgress,
  }) async {
    calls++;
    final out = File('${source.path}.enc.mp4')
      ..writeAsBytesSync(List<int>.filled(10, 9));
    return XFile(out.path, mimeType: 'video/mp4');
  }

  @override
  Future<void> cancel() async {}
}

ProviderContainer _container(
  FakeGroupRepository repo,
  FakeStorageUploader uploader, {
  VideoCompressor? encoder,
}) {
  final c = ProviderContainer(
    overrides: [
      groupRepositoryProvider.overrideWithValue(repo),
      realtimeClientProvider.overrideWithValue(null),
      ...uploadQueueOverrides(uploader: uploader),
      if (encoder != null) videoCompressorProvider.overrideWithValue(encoder),
    ],
  );
  addTearDown(c.dispose);
  return c;
}

Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 80));

/// R-255: group files go through the persistent queue, from disk.
void main() {
  test('a file on disk is copied to the queue and sent from there', () async {
    final dir = Directory.systemTemp.createTempSync('picked');
    addTearDown(() => dir.deleteSync(recursive: true));
    final picked = File('${dir.path}/report.pdf')
      ..writeAsBytesSync(List<int>.filled(4096, 7));
    final repo = FakeGroupRepository();
    final uploader = FakeStorageUploader();
    final c = _container(repo, uploader);
    final sub = c.listen(groupThreadProvider(_key), (_, __) {});
    addTearDown(sub.close);
    await _settle();

    await c.read(groupThreadProvider(_key).notifier).queueAttachment(
          bytes: Uint8List(0),
          path: picked.path,
          name: 'report.pdf',
          mime: 'application/pdf',
          caption: 'see this',
          replyToId: 'm-1',
        );
    await c.read(groupMediaOutboxProvider).drain();
    await _settle();

    expect(uploader.uploads.single.size, 4096);
    expect(uploader.uploads.single.purpose, api.FilePurpose.chatAttachment);
    final sent = repo.sentBodies.single;
    expect(sent.fileName, 'report.pdf');
    expect(sent.fileId, 'file-1');
    expect(sent.body, 'see this');
    expect(sent.replyToId, 'm-1');
    expect(sent.type, api.SendGroupMessageDtoType.attachment);
    expect(picked.existsSync(), isTrue, reason: "the user's file stays");
    final s = c.read(groupThreadProvider(_key));
    expect(s.pending, isEmpty, reason: 'the bubble became the message');
    expect(s.messages.single.clientMessageId, sent.clientMessageId);
  });

  test(
      'owner 27.11: a recorded gallery video shows its bubble at once and is '
      'encoded in the queue, then sent as MP4', () async {
    const frames = MethodChannel('lawbid/video_frame');
    final jpeg = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xD9]);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(frames, (_) async => {'jpeg': jpeg});
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(frames, null),
    );
    final dir = Directory.systemTemp.createTempSync('picked');
    addTearDown(() => dir.deleteSync(recursive: true));
    final clip = File('${dir.path}/clip.mov')
      ..writeAsBytesSync(List<int>.filled(500, 1));
    markRecordedVideo(clip.path);
    final repo = FakeGroupRepository();
    final uploader = FakeStorageUploader();
    final encoder = _Encoder();
    final c = _container(repo, uploader, encoder: encoder);
    final sub = c.listen(groupThreadProvider(_key), (_, __) {});
    addTearDown(sub.close);
    await _settle();

    await c.read(groupThreadProvider(_key).notifier).queueAttachment(
          bytes: Uint8List(0),
          path: clip.path,
          name: 'clip.mov',
          mime: 'video/quicktime',
          encodeVideo: isRecordedVideo(clip.path),
        );
    await c.read(groupMediaOutboxProvider).drain();
    await _settle();

    expect(encoder.calls, 1);
    expect(uploader.uploads.single.size, 10, reason: 'the encoded file');
    expect(repo.sentBodies.single.fileName, 'clip.mp4');
  });

  test('files keep the picked order, with the same id on every try', () async {
    final repo = FakeGroupRepository();
    final c = _container(repo, FakeStorageUploader());
    final sub = c.listen(groupThreadProvider(_key), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final thread = c.read(groupThreadProvider(_key).notifier);
    for (final name in ['1.pdf', '2.pdf']) {
      await thread.queueAttachment(
        bytes: Uint8List.fromList([1, 2, 3]),
        name: name,
        mime: 'application/pdf',
      );
    }
    await c.read(groupMediaOutboxProvider).drain();
    await _settle();
    expect(repo.sentBodies.map((b) => b.fileName), ['1.pdf', '2.pdf']);
    expect(
      repo.sentBodies.map((b) => b.clientMessageId).toSet(),
      hasLength(2),
    );
  });

  test('a refused file stays as «not sent»: Retry sends, Delete removes',
      () async {
    final repo = FakeGroupRepository()
      ..refuseSend = const ApiException(
        code: 'FORBIDDEN',
        message: 'no media',
        statusCode: 403,
      );
    final c = _container(repo, FakeStorageUploader());
    final sub = c.listen(groupThreadProvider(_key), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final thread = c.read(groupThreadProvider(_key).notifier);
    for (final name in ['a.pdf', 'b.pdf']) {
      await thread.queueAttachment(
        bytes: Uint8List.fromList([1]),
        name: name,
        mime: 'application/pdf',
      );
    }
    await c.read(groupMediaOutboxProvider).drain();
    await _settle();

    var pending = c.read(groupThreadProvider(_key)).pending;
    expect(pending.map((p) => p.fileName), ['a.pdf', 'b.pdf']);
    expect(pending.every((p) => p.failed), isTrue);

    repo.refuseSend = null;
    thread.dropPending(pending.last.clientMessageId);
    await _settle();
    await thread.retry(pending.first.clientMessageId);
    await c.read(groupMediaOutboxProvider).drain();
    await _settle();

    expect(repo.sentBodies.map((b) => b.fileName), ['a.pdf']);
    pending = c.read(groupThreadProvider(_key)).pending;
    expect(pending, isEmpty);
    expect(await c.read(uploadQueueProvider).db.pending('me'), isEmpty);
  });

  test('a job left from the last run shows its bubble in the thread', () async {
    final repo = FakeGroupRepository()..failSend = true;
    final c = _container(repo, FakeStorageUploader());
    final queue = c.read(groupMediaOutboxProvider);
    await queue.enqueue(
      id: 'left-1',
      kind: GroupMediaKind.attachment,
      target: 'g1',
      payload: {'name': 'old.pdf', 'caption': ''},
      fileName: 'left-1.bin',
      mime: 'application/pdf',
    );
    final sub = c.listen(groupThreadProvider(_key), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    expect(
      c.read(groupThreadProvider(_key)).pending.single.clientMessageId,
      'left-1',
    );
  });
}
