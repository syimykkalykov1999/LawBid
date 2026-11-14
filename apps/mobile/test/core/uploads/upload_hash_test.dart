import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/core/uploads/upload_hash_io.dart';

/// Media audit 13.11 (D9): the presign hash is worked out in a background
/// isolate on a phone and matches the in-place hash exactly.
void main() {
  final big = Uint8List.fromList(List.generate(3 << 20, (i) => i * 31 & 0xff));

  test('bytes over the in-place size hash in an isolate, same result',
      () async {
    expect(big.length, greaterThan(kHashInPlaceBytes));
    expect(
      await UploadBody.bytes(big).sha256Hex(),
      sha256.convert(big).toString(),
    );
    final small = Uint8List.fromList([1, 2, 3]);
    expect(await sha256OfBytes(small), sha256.convert(small).toString());
  });

  test('a file on disk is streamed and hashed in an isolate', () async {
    final dir = await Directory.systemTemp.createTemp('hash');
    addTearDown(() => dir.delete(recursive: true));
    final f = File('${dir.path}/video.mp4');
    await f.writeAsBytes(big);
    expect(
      await UploadBody.file(f.path).sha256Hex(),
      sha256.convert(big).toString(),
    );
    // A voice note (a few KB) is hashed in place: no isolate start-up.
    final note = File('${dir.path}/note.m4a');
    final small = Uint8List.fromList(List.filled(2048, 7));
    await note.writeAsBytes(small);
    expect(await sha256OfFile(note.path), sha256.convert(small).toString());
  });
}
