import 'dart:async';

import 'package:camera_platform_interface/camera_platform_interface.dart';
import 'package:flutter/gestures.dart' show kLongPressTimeout;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/stories/presentation/story_camera_view.dart';
import 'package:material_ui/material_ui.dart';

/// A phone camera for widget tests: one back camera, starts and stops
/// recordings on request.
class _FakeCamera extends CameraPlatform {
  int _next = 0;
  final _initialized = <int, StreamController<CameraInitializedEvent>>{};
  int starts = 0;
  int stops = 0;
  int disposed = 0;

  @override
  Future<List<CameraDescription>> availableCameras() async => const [
        CameraDescription(
          name: 'back',
          lensDirection: CameraLensDirection.back,
          sensorOrientation: 90,
        ),
      ];

  @override
  Future<int> createCameraWithSettings(
    CameraDescription cameraDescription,
    MediaSettings mediaSettings,
  ) async =>
      ++_next;

  @override
  Stream<CameraInitializedEvent> onCameraInitialized(int cameraId) =>
      (_initialized[cameraId] ??=
              StreamController<CameraInitializedEvent>.broadcast())
          .stream;

  @override
  Stream<CameraErrorEvent> onCameraError(int cameraId) => _errors.stream;

  // The controller waits for the first error: a stream that never ends.
  final _errors = StreamController<CameraErrorEvent>.broadcast();

  @override
  Stream<CameraClosingEvent> onCameraClosing(int cameraId) =>
      const Stream.empty();

  @override
  Stream<DeviceOrientationChangedEvent> onDeviceOrientationChanged() =>
      const Stream.empty();

  @override
  Future<void> initializeCamera(
    int cameraId, {
    ImageFormatGroup imageFormatGroup = ImageFormatGroup.unknown,
  }) async {
    scheduleMicrotask(
      () => (_initialized[cameraId] ??=
              StreamController<CameraInitializedEvent>.broadcast())
          .add(
        CameraInitializedEvent(
          cameraId,
          1080,
          1920,
          ExposureMode.auto,
          false,
          FocusMode.auto,
          false,
        ),
      ),
    );
  }

  @override
  Future<void> startVideoCapturing(VideoCaptureOptions options) async {
    starts++;
  }

  @override
  Future<XFile> stopVideoRecording(int cameraId) async {
    stops++;
    return XFile('/tmp/story-$stops.mp4');
  }

  @override
  Widget buildPreview(int cameraId) => const SizedBox.expand();

  @override
  Future<void> dispose(int cameraId) async {
    disposed++;
  }
}

/// ROUND1 25.11 row 18: a call (or the Control Center) while a story video
/// records. The camera is closed when the app goes inactive, but the screen
/// stayed «recording»: the timer ran on, the shutter refused every new hold
/// after the return and the clip was lost. Now the recording ends with the
/// camera (the clip goes on like a released hold) and the shutter works
/// again.
void main() {
  late _FakeCamera camera;
  setUp(() => CameraPlatform.instance = camera = _FakeCamera());

  testWidgets('a call during a story video leaves the shutter working',
      (tester) async {
    final videos = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: StoryCameraView(
          maxVideoSec: 30,
          onPhoto: (_) {},
          onVideo: (f) => videos.add(f.path),
          onGallery: () {},
          onText: () {},
          onSystemPhoto: () {},
          onSystemVideo: () {},
          galleryLabel: 'Gallery',
          shutterLabel: 'Shutter',
          textLabel: 'Text',
          flipLabel: 'Flip',
        ),
      ),
    );
    await tester.pumpAndSettle();
    final shutter = find.byKey(const ValueKey('story-shutter'));

    // Hold: the video records.
    final hold = await tester.startGesture(tester.getCenter(shutter));
    await tester.pump(kLongPressTimeout + const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 800));
    expect(camera.starts, 1);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    // The clip's length is wall-clock time (a hold under 0.5 s is a mis-tap).
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 600)),
    );

    // A call comes in: the app goes inactive, then back.
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    await hold.up();
    await tester.pumpAndSettle();
    expect(camera.stops, 1, reason: 'the recording ends with the camera');
    expect(videos, ['/tmp/story-1.mp4'], reason: 'what was recorded is kept');
    expect(find.byType(CircularProgressIndicator), findsNothing);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    // The shutter records again.
    final again = await tester.startGesture(tester.getCenter(shutter));
    await tester.pump(kLongPressTimeout + const Duration(milliseconds: 50));
    expect(camera.starts, 2);
    await again.up();
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox());
  });
}
