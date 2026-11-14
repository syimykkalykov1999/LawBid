import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/data/chat_video_frames.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_video.dart';
import 'package:video_player/video_player.dart';
import 'package:visibility_detector/visibility_detector.dart';

/// A 1×1 JPEG.
final _jpeg = Uint8List.fromList(const [
  0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, //
  0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D,
  0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F,
  0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C,
  0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34,
  0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF,
  0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x09,
  0xFF, 0xC4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x2A, 0x9F,
  0xFF, 0xD9,
]);

/// No disk in tests (a write throws: [Fake]).
class _NoCache extends Fake implements BaseCacheManager {
  @override
  Future<FileInfo?> getFileFromCache(
    String key, {
    bool ignoreMemCache = false,
  }) async =>
      null;
}

class _FixedFrames extends ChatVideoFrames {
  _FixedFrames(this.frame) : super(supported: true);

  final ChatVideoFrame? frame;
  final asked = <String>[];

  @override
  Future<ChatVideoFrame?> load(String fileId, String source) async {
    asked.add(source);
    return frame;
  }
}

const _video = ChatAttachment(
  fileId: 'v1',
  name: 'clip.mp4',
  isImage: false,
  mime: 'video/mp4',
  url: 'https://storage.test/v1?X-Amz-Signature=x',
  width: 720,
  height: 1280,
);

/// Owner row 106 (media audit 13.11, batch F item 13; WhatsApp / Telegram):
/// a chat video tile draws the video's first frame as a picture; no player
/// is opened for the tile.
void main() {
  late ChatVideoFrames original;

  setUp(() {
    original = ChatVideoFrames.instance;
    VisibilityDetectorController.instance.updateInterval = Duration.zero;
  });

  tearDown(() => ChatVideoFrames.instance = original);

  Widget app(Widget child) => ProviderScope(
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(body: Center(child: child)),
        ),
      );

  testWidgets('a kept frame: a picture and the length, no player',
      (tester) async {
    final frames = _FixedFrames(
      ChatVideoFrame(_jpeg, const Duration(seconds: 75)),
    );
    ChatVideoFrames.instance = frames;
    await tester.pumpWidget(
      app(
        const ChatVideoTile(
          attachment: _video,
          sending: false,
          playLabel: 'play',
        ),
      ),
    );
    await tester.pump();
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 20)),
    );
    await tester.pump();
    await tester.pump();
    expect(frames.asked, [_video.url]);
    expect(find.byType(Image), findsOneWidget);
    expect(find.byType(VideoPlayer), findsNothing);
    expect(find.text('1:15'), findsOneWidget);
  });

  test('no channel (browser, tests): no frame, the tile keeps its player', () {
    final frames = ChatVideoFrames(
      channel: const MethodChannel('lawbid/video_frame_missing'),
      supported: false,
    );
    expect(frames.load('v1', 'https://x.test/v'), completion(isNull));
  });

  test('the phone makes the frame once from the link', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    const channel = MethodChannel('lawbid/video_frame_test');
    var calls = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls++;
      expect(call.method, 'frame');
      expect((call.arguments as Map)['url'], 'https://x.test/v');
      return {'jpeg': _jpeg, 'durationMs': 4200};
    });
    final frames = ChatVideoFrames(
      channel: channel,
      supported: true,
      cache: _NoCache.new,
    );
    final both = await Future.wait([
      frames.load('v1', 'https://x.test/v'),
      frames.load('v1', 'https://x.test/v'),
    ]);
    expect(calls, 1, reason: 'two tiles of one video share one making');
    expect(both.first?.length, const Duration(milliseconds: 4200));
    expect(both.first?.jpeg, _jpeg);
  });
}
