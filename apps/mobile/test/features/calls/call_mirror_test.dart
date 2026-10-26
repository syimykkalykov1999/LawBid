import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';

/// Owner 2026-10-23 (WhatsApp / FaceTime): only our own picture from the
/// front camera is mirrored; a rear camera and every remote picture are not.
const _method = MethodChannel('FlutterWebRTC.Method');
const _texture = EventChannel('FlutterWebRTC/Texture1');
// The plugin's first call starts listening here once per test file
// (NativeLogsListener). Unmocked, its MissingPluginException is reported
// a moment later — inside whichever test runs then (flaky on CI).
const _events = EventChannel('FlutterWebRTC.Event');

void main() {
  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      ..setMockMethodCallHandler(_method, (call) async {
        if (call.method == 'createVideoRenderer') {
          return {'textureId': 1};
        }
        if (call.method == 'createLocalMediaStream') {
          return {
            'streamId': 'stream-1',
            'ownerTag': 'owner',
            'audioTracks': <dynamic>[],
            'videoTracks': <dynamic>[],
          };
        }
        return null;
      })
      ..setMockStreamHandler(
        _texture,
        MockStreamHandler.inline(onListen: (_, __) {}, onCancel: (_) {}),
      )
      ..setMockStreamHandler(
        _events,
        MockStreamHandler.inline(onListen: (_, __) {}, onCancel: (_) {}),
      );
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      ..setMockMethodCallHandler(_method, null)
      ..setMockStreamHandler(_texture, null)
      ..setMockStreamHandler(_events, null);
  });

  Future<RTCVideoView> pumpPicture(
    WidgetTester tester, {
    required bool isLocal,
    required bool frontCamera,
  }) async {
    final stream = await tester.runAsync(
      () => createLocalMediaStream('stream-1'),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 200,
            height: 300,
            child: CallVideoView(
              stream: stream!,
              mirror: callMirrorFor(
                isLocal: isLocal,
                frontCamera: frontCamera,
              ),
            ),
          ),
        ),
      ),
    );
    // The renderer initialises over the (mocked) platform channel.
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pump();
    return tester.widget<RTCVideoView>(find.byType(RTCVideoView));
  }

  testWidgets('our own picture from the front camera is mirrored',
      (tester) async {
    final view = await pumpPicture(
      tester,
      isLocal: true,
      frontCamera: true,
    );
    expect(view.mirror, isTrue);
  });

  testWidgets('our own picture from the rear camera is not mirrored',
      (tester) async {
    final view = await pumpPicture(
      tester,
      isLocal: true,
      frontCamera: false,
    );
    expect(view.mirror, isFalse);
  });

  testWidgets('a remote picture is never mirrored, front or rear',
      (tester) async {
    final front = await pumpPicture(
      tester,
      isLocal: false,
      frontCamera: true,
    );
    expect(front.mirror, isFalse);

    final rear = await pumpPicture(
      tester,
      isLocal: false,
      frontCamera: false,
    );
    expect(rear.mirror, isFalse);
  });

  test(
      'the call starts on the front camera, a flip toggles it, a reopen '
      'is the front one', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final n = c.read(callFrontCameraProvider.notifier);
    expect(c.read(callFrontCameraProvider), isTrue);
    n.flip();
    expect(c.read(callFrontCameraProvider), isFalse);
    n.flip();
    expect(c.read(callFrontCameraProvider), isTrue);
    n.flip();
    expect(c.read(callFrontCameraProvider), isFalse);
    // A reopened camera (or the next call) is the front one again.
    n.front();
    expect(c.read(callFrontCameraProvider), isTrue);
  });
}
