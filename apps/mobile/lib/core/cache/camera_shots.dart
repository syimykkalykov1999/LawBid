import 'dart:io';
import 'dart:typed_data';

import 'package:camera/camera.dart' show XFile;
import 'package:flutter/foundation.dart'
    show TargetPlatform, debugPrint, defaultTargetPlatform, kIsWeb;
import 'package:lawbid/core/cache/media_cache_dir.dart';
import 'package:lawbid/core/persistence/drift_web.dart' show isFlutterTest;

/// D1-44: the camera plugins write every shot to a JPEG on disk before the
/// app reads it — camera_android_camerax `File.createTempFile("CAP",
/// ".jpg", cacheDir)`, camera_avfoundation `<tmp>/camera/pictures/CAP_….jpg`.
/// Identity documents and verification selfies must not stay there: the
/// bytes are read and the file goes at once (also when the read fails).
Future<Uint8List> readAndDeleteCameraShot(XFile shot) async {
  try {
    return await shot.readAsBytes();
  } finally {
    await deleteCameraShot(shot);
  }
}

/// Deletes the file behind [shot]; a shot already gone (or the web, where
/// the shot is a blob in memory) is fine.
Future<void> deleteCameraShot(XFile shot) async {
  if (kIsWeb || shot.path.isEmpty) return;
  try {
    final f = File(shot.path);
    if (f.existsSync()) await f.delete();
  } on Object catch (e) {
    debugPrint('camera shot delete: $e');
  }
}

/// The places the camera plugins leave their shots (the backstop sweep on
/// sign-out and at start, for a shot an app kill left behind).
List<PrefixedTempFiles> cameraShotTempFiles() {
  if (kIsWeb || isFlutterTest) return const [];
  return switch (defaultTargetPlatform) {
    // path_provider's temporary directory is the app's cacheDir here.
    TargetPlatform.android => const [PrefixedTempFiles('CAP', suffix: '.jpg')],
    // NSTemporaryDirectory (Dart's systemTemp), not path_provider's Caches.
    TargetPlatform.iOS => [
        PrefixedTempFiles(
          'CAP_',
          suffix: '.jpg',
          root: () async =>
              Directory('${Directory.systemTemp.path}/camera/pictures'),
        ),
      ],
    _ => const [],
  };
}

/// Empties [cameraShotTempFiles] (sign-out), or only the shots older than
/// [olderThan] (app start: a shot another screen still holds, such as a
/// story being edited, stays). Never throws.
Future<void> sweepCameraShots({Duration? olderThan}) async {
  for (final files in cameraShotTempFiles()) {
    if (olderThan == null) {
      await files.clear();
    } else {
      await files.dropOlderThan(olderThan);
    }
  }
}
