import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart' show CancelToken;
import 'package:drift/native.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/features/chat/application/chat_media_outbox.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/application/send_picked.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';
import 'package:lawbid/features/chat/presentation/media_preview_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:material_ui/material_ui.dart';

import '../../helpers/upload_queue_overrides.dart';
import '../../helpers/ux_harness.dart';

/// Owner 27.11 (iPhone: «обрабатываем видео», then a black preview with a
/// file name): a chat video is handled like WhatsApp / Telegram — picked
/// as recorded (no encode before the preview), the preview shows its own
/// first frame, the bubble shows that frame at once with its ring, and the
/// upload queue shrinks the video with the phone's encoder before upload.

const _frames = MethodChannel('lawbid/video_frame');
const _picker = MethodChannel('plugins.flutter.io/image_picker');

/// A 1×1 PNG: the «first frame» the phone's frame maker returns here.
final _png = Uint8List.fromList(const [
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, //
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
  0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0xF8, 0xCF, 0xC0, 0xF0,
  0x1F, 0x00, 0x05, 0x00, 0x01, 0xFF, 0x89, 0x99, 0x3D, 0x1D, 0x00, 0x00,
  0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
]);

class _Chat implements ChatRepository {
  final sent = <String>[];

  @override
  Future<Conversation> conversation(String id) async => Conversation(
        id: 'c1',
        caseId: 'case-1',
        caseTitle: 'Lease',
        status: ConversationStatus.active,
        contactsUnlocked: true,
        counterpart: const Counterpart(isAttorney: true, verified: true),
        unreadCount: 0,
        updatedAt: DateTime(2026),
      );

  @override
  Future<CursorPage<ChatMessage>> messages(String id, {String? cursor}) async =>
      const CursorPage(items: []);

  @override
  Future<ChatMessage> sendAttachment(
    String id,
    String clientMessageId, {
    required String fileId,
    required String fileName,
    String? caption,
    String? replyToId,
  }) async {
    sent.add(fileName);
    return ChatMessage(
      id: 'srv-${sent.length}',
      conversationId: 'c1',
      senderId: 'me',
      kind: MessageKind.attachment,
      body: caption ?? '',
      clientMessageId: clientMessageId,
      createdAt: DateTime.now(),
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

/// Records the type and size of each upload.
class _Uploader extends FakeStorageUploader {
  final mimes = <String>[];

  @override
  Future<String> upload({
    required api.FilePurpose purpose,
    required UploadBody body,
    required String mime,
    String filename = 'file',
    void Function(double progress)? onProgress,
    CancelToken? cancel,
    int? scanMaxPolls,
    StorageTransport? transport,
    String? taskId,
    StorageTarget? savedTarget,
    Future<void> Function(StorageTarget target)? onTarget,
    String? resumeFileId,
    void Function(String fileId)? onPartsFileId,
    Future<void> Function(String fileId)? onStored,
    bool waitScan = true,
  }) {
    mimes.add(mime);
    return super.upload(
      purpose: purpose,
      body: body,
      mime: mime,
      filename: filename,
      onProgress: onProgress,
      cancel: cancel,
      taskId: taskId,
      savedTarget: savedTarget,
      onTarget: onTarget,
      resumeFileId: resumeFileId,
      onPartsFileId: onPartsFileId,
      onStored: onStored,
      waitScan: waitScan,
    );
  }
}

/// The phone's encoder: writes a smaller MP4 next to the source, or keeps
/// the original ([keep]).
class _Encoder implements VideoCompressor {
  _Encoder(this.dir, {this.keep = false, this.gate});

  final Directory dir;
  final bool keep;

  /// Set: the encode waits for it (to look at the bubble meanwhile).
  final Completer<void>? gate;
  final calls = <VideoLimits>[];

  @override
  Future<XFile?> compress(
    XFile source, {
    required VideoLimits limits,
    void Function(double progress)? onProgress,
  }) async {
    calls.add(limits);
    await gate?.future;
    if (keep) return null;
    final out = File('${dir.path}/enc-${calls.length}.mp4')
      ..writeAsBytesSync(List<int>.filled(100, 9));
    return XFile(out.path, mimeType: 'video/mp4');
  }

  @override
  Future<void> cancel() async {}
}

ProviderContainer _container(
  _Chat chat,
  FakeStorageUploader uploader,
  VideoCompressor encoder,
) {
  final db = SocialLocalDatabase(NativeDatabase.memory());
  final c = ProviderContainer(
    overrides: [
      chatRepositoryProvider.overrideWithValue(chat),
      socialLocalDatabaseProvider.overrideWithValue(db),
      ...uploadQueueOverrides(uploader: uploader),
      currentUserIdProvider.overrideWithValue('me'),
      realtimeClientProvider.overrideWithValue(null),
      networkInterfaceMonitorProvider.overrideWithValue(FakeNetworkMonitor()),
      reachabilityProbeProvider.overrideWithValue(FakeProbe().call),
      videoCompressorProvider.overrideWithValue(encoder),
    ],
  );
  addTearDown(() async {
    c.dispose();
    await db.close();
  });
  return c;
}

Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 80));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory dir;
  var frameCalls = 0;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('chat-video');
    frameCalls = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_frames, (call) async {
      frameCalls++;
      return {'jpeg': _png, 'durationMs': 12000};
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_frames, null);
    dir.deleteSync(recursive: true);
  });

  PickedChatFile recorded(String name, int size) {
    final f = File('${dir.path}/$name')
      ..writeAsBytesSync(List<int>.filled(size, 1));
    markRecordedVideo(f.path);
    return (
      bytes: Uint8List(0),
      name: name,
      mime: 'video/quicktime',
      path: f.path,
      diskBytes: size,
    );
  }

  test(
      'a recorded video: bubble at once with its frame, encoded in the queue, '
      'sent as MP4', () async {
    final chat = _Chat();
    final uploader = _Uploader();
    final gate = Completer<void>();
    final encoder = _Encoder(dir, gate: gate);
    final c = _container(chat, uploader, encoder);
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final thread = c.read(chatThreadProvider('c1').notifier);
    final queue = c.read(chatMediaOutboxProvider);
    final picked = recorded('IMG_0001.MOV', 5000);
    await sendPickedFiles(thread, [picked], 'look');
    await _settle();

    // The bubble is there before anything is encoded or uploaded, with the
    // video's own first frame as its picture.
    final local = c.read(chatThreadProvider('c1')).voiceOutbox.single;
    expect(local.delivery, DeliveryState.sending);
    expect(local.attachment!.isVideo, isTrue);
    expect(local.attachment!.localBytes, _png);
    expect(uploader.uploads, isEmpty, reason: 'still being encoded');
    expect(
      File(picked.path!).existsSync(),
      isFalse,
      reason: "the picker's temporary copy is moved into the queue",
    );

    gate.complete();
    await queue.drain();
    await _settle();
    expect(encoder.calls.single.maxHeight, 720);
    expect(uploader.mimes, ['video/mp4']);
    expect(uploader.uploads.single.size, 100, reason: 'the encoded file');
    expect(chat.sent, ['IMG_0001.mp4']);
  });

  test('encoding does not help: the original goes as it was', () async {
    final chat = _Chat();
    final uploader = _Uploader();
    final c = _container(chat, uploader, _Encoder(dir, keep: true));
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final thread = c.read(chatThreadProvider('c1').notifier);
    await sendPickedFiles(thread, [recorded('clip.mov', 3000)], '');
    await c.read(chatMediaOutboxProvider).drain();
    await _settle();
    expect(uploader.mimes, ['video/quicktime']);
    expect(uploader.uploads.single.size, 3000);
    expect(chat.sent, ['clip.mov']);
  });

  test('a video picked in «Files» goes as a document, never encoded',
      () async {
    final chat = _Chat();
    final uploader = _Uploader();
    final encoder = _Encoder(dir);
    final c = _container(chat, uploader, encoder);
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final thread = c.read(chatThreadProvider('c1').notifier);
    final doc = File('${dir.path}/talk.mp4')
      ..writeAsBytesSync(List<int>.filled(2000, 3));
    await sendPickedFiles(
      thread,
      [
        (
          bytes: Uint8List(0),
          name: 'talk.mp4',
          mime: 'video/mp4',
          path: doc.path,
          diskBytes: 2000,
        ),
      ],
      '',
    );
    await c.read(chatMediaOutboxProvider).drain();
    await _settle();
    expect(encoder.calls, isEmpty);
    expect(uploader.uploads.single.size, 2000);
    expect(chat.sent, ['talk.mp4']);
    expect(doc.existsSync(), isTrue, reason: "the user's file stays");
  });

  group('picker and preview', () {
    const t = StaticTranslatorEn();

    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_picker, null);
    });

    testWidgets('the gallery hands a video over as recorded (no encode)',
        (tester) async {
      final clip = File('${dir.path}/big.mov')
        ..writeAsBytesSync(List<int>.filled(64, 1));
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_picker, (_) async => [clip.path]);
      late BuildContext ctx;
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Builder(
            builder: (c) {
              ctx = c;
              return const SizedBox();
            },
          ),
        ),
      );
      var prepared = 0;
      final out = await tester.runAsync(
        () => pickChatFiles(
          ctx,
          t,
          directChoice: 'photos',
          fromDisk: true,
          deferVideo: true,
          prepareVideo: (v) async {
            prepared++;
            return v;
          },
        ),
      );
      expect(prepared, 0, reason: 'nothing is encoded before the preview');
      expect(out!.single.path, clip.path);
      expect(out.single.mime, 'video/quicktime');
      expect(isRecordedVideo(clip.path), isTrue);
    });

    testWidgets('the preview shows the video itself, not a file card',
        (tester) async {
      final clip = File('${dir.path}/p.mov')
        ..writeAsBytesSync(List<int>.filled(64, 1));
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: AppTheme.light(),
            home: MediaPreviewScreen(
              files: [
                (
                  bytes: Uint8List(0),
                  name: 'p.mov',
                  mime: 'video/quicktime',
                  path: clip.path,
                  diskBytes: 64,
                ),
              ],
            ),
          ),
        ),
      );
      await tester.runAsync(_settle);
      await tester.pump();
      expect(find.byKey(const ValueKey('preview-video')), findsOneWidget);
      expect(find.text('p.mov'), findsNothing, reason: 'no file-name card');
      expect(
        find.descendant(
          of: find.byKey(const ValueKey('preview-video')),
          matching: find.byType(Image),
        ),
        findsOneWidget,
        reason: 'its first frame',
      );
      expect(find.text('0:12'), findsOneWidget, reason: 'its length');
      expect(frameCalls, 1);
    });
  });
}
