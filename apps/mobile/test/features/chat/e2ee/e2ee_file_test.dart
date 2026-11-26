import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_file.dart';

/// Item 25, PR 4: the encrypted chat file format ("LBE1", AES-256-GCM
/// segments of 64 KiB, the last one marked in its nonce). The server's
/// `e2ee-file.ts` reads the same format (apps/api/test/
/// owner-chat-e2ee-files.e2e-spec.ts).
void main() {
  Uint8List bytes(int n) =>
      Uint8List.fromList(List<int>.generate(n, (i) => (i * 31 + 7) & 0xff));

  test('round trip: empty, one segment, exactly two, more', () async {
    final key = E2eeFile.newKey();
    for (final n in [0, 1, E2eeFile.segment, 2 * E2eeFile.segment, 200001]) {
      final plain = bytes(n);
      final blob = await E2eeFile.encrypt(plain, key);
      expect(blob.sublist(0, 4), [0x4c, 0x42, 0x45, 0x31]);
      expect(await E2eeFile.decrypt(blob, key), plain, reason: 'n=$n');
    }
  });

  test(
      'streaming: odd-sized pieces in and out give the same format, one '
      'segment at a time', () async {
    final key = E2eeFile.newKey();
    final plain = bytes(3 * E2eeFile.segment + 999);
    Stream<List<int>> pieces(Uint8List b, int size) async* {
      for (var i = 0; i < b.length; i += size) {
        yield Uint8List.sublistView(b, i, (i + size).clamp(0, b.length));
      }
    }

    final out = BytesBuilder();
    await for (final c in E2eeFile.encryptStream(pieces(plain, 7777), key)) {
      out.add(c);
    }
    final blob = out.takeBytes();
    expect(blob.length, E2eeFile.sealedLength(plain.length));
    // The bytes API reads it (same format as the server's e2ee-file.ts).
    expect(await E2eeFile.decrypt(blob, key), plain);
    final back = BytesBuilder();
    await for (final c in E2eeFile.decryptStream(pieces(blob, 5000), key)) {
      // Never more than one segment comes out at a time.
      expect(c.length, lessThanOrEqualTo(E2eeFile.segment));
      back.add(c);
    }
    expect(back.takeBytes(), plain);
  });

  test('a wrong key, a changed byte or a cut-off end opens nothing', () async {
    final key = E2eeFile.newKey();
    final blob = await E2eeFile.encrypt(bytes(3 * E2eeFile.segment), key);
    await expectLater(
      E2eeFile.decrypt(blob, E2eeFile.newKey()),
      throwsA(anything),
    );
    final changed = Uint8List.fromList(blob)..[100] ^= 1;
    await expectLater(E2eeFile.decrypt(changed, key), throwsA(anything));
    // Dropping the last segment: the new last one is not marked as last.
    final cut =
        Uint8List.sublistView(blob, 0, 11 + 2 * (E2eeFile.segment + 16));
    await expectLater(E2eeFile.decrypt(cut, key), throwsA(anything));
    await expectLater(
      E2eeFile.decrypt(Uint8List.fromList([1, 2, 3]), key),
      throwsFormatException,
    );
  });
}
