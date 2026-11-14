import 'dart:io';

import 'package:camera/camera.dart' show XFile;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/camera_shots.dart';

/// D1-44: an ID photo or selfie never stays behind as a camera temp file.
void main() {
  late Directory dir;
  setUp(() => dir = Directory.systemTemp.createTempSync('camera_shots_'));
  tearDown(() => dir.deleteSync(recursive: true));

  test('the shot is read, then its file is gone', () async {
    final f = File('${dir.path}/CAP_1.jpg')..writeAsBytesSync([1, 2, 3]);
    final bytes = await readAndDeleteCameraShot(XFile(f.path));
    expect(bytes, [1, 2, 3]);
    expect(f.existsSync(), isFalse);
  });

  test('a failed read still deletes what exists, and never throws twice',
      () async {
    final missing = XFile('${dir.path}/CAP_gone.jpg');
    await expectLater(readAndDeleteCameraShot(missing), throwsA(anything));
    await deleteCameraShot(missing);
  });
}
