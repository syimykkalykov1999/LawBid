import 'dart:math' as math;
import 'dart:ui' show Rect, Size;

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter/services.dart' show DeviceOrientation;
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:lawbid/features/verification/domain/selfie_liveness.dart';

/// Owner 2026-10-28 (ID selfie camera): turns a camera frame into
/// [FrameSignals]. Free and on-device (Google ML Kit): no picture leaves
/// the phone for detection.
abstract interface class SelfieFrameDetector {
  /// Whether this platform can detect at all (false on the web).
  bool get available;

  /// The camera stream format the detector needs.
  ImageFormatGroup get streamFormat;

  /// Detects faces (and, with [readText], text where an ID card is held)
  /// in [image]. [screen] is the preview's size on screen (the preview
  /// covers it, BoxFit.cover). Throws [UnsupportedError] for a frame it
  /// cannot read (the screen then falls back to a manual shot).
  Future<FrameSignals> detect(
    CameraImage image, {
    required CameraDescription camera,
    required DeviceOrientation orientation,
    required Size screen,
    required bool readText,
  });

  Future<void> close();
}

class MlKitSelfieFrameDetector implements SelfieFrameDetector {
  MlKitSelfieFrameDetector();

  // Fast mode + classification (eye-open probabilities); no landmarks or
  // contours (they cost time and are not used). minFaceSize 0.15: a face
  // far smaller than the oval is "move closer" anyway.
  late final FaceDetector _faces = FaceDetector(
    options: FaceDetectorOptions(
      enableClassification: true,
      minFaceSize: 0.15,
    ),
  );
  late final TextRecognizer _text = TextRecognizer();
  bool _textUsed = false;

  @override
  bool get available =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  @override
  ImageFormatGroup get streamFormat =>
      defaultTargetPlatform == TargetPlatform.iOS
          ? ImageFormatGroup.bgra8888
          : ImageFormatGroup.nv21;

  @override
  Future<FrameSignals> detect(
    CameraImage image, {
    required CameraDescription camera,
    required DeviceOrientation orientation,
    required Size screen,
    required bool readText,
  }) async {
    final input = _inputImage(image, camera, orientation);
    final rotation = input.metadata!.rotation;
    final quarter = rotation == InputImageRotation.rotation90deg ||
        rotation == InputImageRotation.rotation270deg;
    final upright = quarter
        ? Size(image.height.toDouble(), image.width.toDouble())
        : Size(image.width.toDouble(), image.height.toDouble());
    final map = CoverMapping(image: upright, screen: screen);
    final faces = await _faces.processImage(input);
    final samples = [
      for (final f in faces)
        FaceSample(
          box: map.normalize(f.boundingBox),
          leftEyeOpen: f.leftEyeOpenProbability,
          rightEyeOpen: f.rightEyeOpenProbability,
          yaw: f.headEulerAngleY,
        ),
    ];
    bool? card;
    if (readText) {
      _textUsed = true;
      final text = await _text.processImage(input);
      card = cardTextNearFace(
        [
          for (final b in text.blocks)
            if (b.text.trim().length >= 3) map.normalize(b.boundingBox),
        ],
        samples.length == 1 ? samples.single.box : null,
      );
    }
    return FrameSignals(
      faces: samples,
      brightness: meanLuma(image),
      cardText: card,
    );
  }

  @override
  Future<void> close() async {
    await _faces.close();
    if (_textUsed) await _text.close();
  }

  static const _deviceDegrees = {
    DeviceOrientation.portraitUp: 0,
    DeviceOrientation.landscapeLeft: 90,
    DeviceOrientation.portraitDown: 180,
    DeviceOrientation.landscapeRight: 270,
  };

  /// google_mlkit_commons' documented recipe: one plane, NV21 on Android,
  /// BGRA8888 on iOS; rotation from the sensor (and on Android the
  /// device's orientation, mirrored for the front camera).
  InputImage _inputImage(
    CameraImage image,
    CameraDescription camera,
    DeviceOrientation orientation,
  ) {
    final sensor = camera.sensorOrientation;
    InputImageRotation? rotation;
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      rotation = InputImageRotationValue.fromRawValue(sensor);
    } else {
      final device = _deviceDegrees[orientation] ?? 0;
      final degrees = camera.lensDirection == CameraLensDirection.front
          ? (sensor + device) % 360
          : (sensor - device + 360) % 360;
      rotation = InputImageRotationValue.fromRawValue(degrees);
    }
    final format = InputImageFormatValue.fromRawValue(image.format.raw as int);
    final ok = rotation != null &&
        image.planes.length == 1 &&
        ((defaultTargetPlatform == TargetPlatform.android &&
                format == InputImageFormat.nv21) ||
            (defaultTargetPlatform == TargetPlatform.iOS &&
                format == InputImageFormat.bgra8888));
    if (!ok) throw UnsupportedError('camera frame format');
    final plane = image.planes.single;
    return InputImage.fromBytes(
      bytes: plane.bytes,
      metadata: InputImageMetadata(
        size: Size(image.width.toDouble(), image.height.toDouble()),
        rotation: rotation,
        format: format!,
        bytesPerRow: plane.bytesPerRow,
      ),
    );
  }

  /// Mean luma 0..255 from ~2 000 samples of the first plane (NV21: the Y
  /// bytes; BGRA: green ≈ luma). Cheap: no full pass over the frame.
  static double? meanLuma(CameraImage image) {
    if (image.planes.isEmpty) return null;
    final bytes = image.planes.first.bytes;
    final bgra = image.format.group == ImageFormatGroup.bgra8888;
    final pixels = image.width * image.height;
    if (pixels == 0 || bytes.isEmpty) return null;
    final step = math.max(1, pixels ~/ 2000);
    var sum = 0;
    var n = 0;
    for (var p = 0; p < pixels; p += step) {
      final i = bgra ? p * 4 + 1 : p;
      if (i >= bytes.length) break;
      sum += bytes[i];
      n++;
    }
    return n == 0 ? null : sum / n;
  }
}

/// Maps a box in the upright camera image to the screen (BoxFit.cover),
/// normalized to 0..1. Mirroring of the front preview is ignored: the
/// checks that use it are symmetric (oval centre tolerance) or side-free
/// (card text anywhere beside the face).
class CoverMapping {
  CoverMapping({required Size image, required Size screen})
      : _image = image,
        _screen = screen;

  final Size _image;
  final Size _screen;

  Rect normalize(Rect r) {
    final scale = math.max(
      _screen.width / _image.width,
      _screen.height / _image.height,
    );
    final dx = (_screen.width - _image.width * scale) / 2;
    final dy = (_screen.height - _image.height * scale) / 2;
    return Rect.fromLTRB(
      (r.left * scale + dx) / _screen.width,
      (r.top * scale + dy) / _screen.height,
      (r.right * scale + dx) / _screen.width,
      (r.bottom * scale + dy) / _screen.height,
    );
  }
}

/// The card hint: a text block on screen that is not on the face and sits
/// roughly at face height (a card held next to the face). Generous on
/// purpose — it only makes the oval turn green sooner.
bool cardTextNearFace(List<Rect> textBlocks, Rect? face) {
  for (final b in textBlocks) {
    final c = b.center;
    if (c.dx < 0 || c.dx > 1 || c.dy < 0 || c.dy > 1) continue;
    if (face == null) return true;
    if (face.contains(c)) continue;
    final band = face.height * 1.2;
    if ((c.dy - face.center.dy).abs() <= band) return true;
  }
  return false;
}
