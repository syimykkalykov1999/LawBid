import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

/// Item 25 (docs/architecture/E2EE_MLS_PLAN_2026-11-25.md §5): a chat file
/// encrypted on the phone before it goes up. The segmented ("online") AEAD
/// construction of Google Tink's AES-GCM-HKDF streaming, as an idea (no Dart
/// port of Tink); AES-256-GCM from the `cryptography` package (Apache-2.0;
/// the browser's WebCrypto on the web). The same format as the server's
/// `e2ee-file.ts`, which decrypts a file only when a report hands it the key.
///
///   "LBE1" | nonce prefix (7) | segments of ≤ 64 KiB + 16-byte tag
///   nonce of segment i = prefix || u32be(i) || (1 on the last, else 0)
abstract final class E2eeFile {
  static const segment = 64 * 1024;
  static const _tag = 16;
  static const _header = 11;
  static final _aes = AesGcm.with256bits();

  static Uint8List newKey() => _random(32);

  static Uint8List _random(int n) {
    final r = Random.secure();
    return Uint8List.fromList(List<int>.generate(n, (_) => r.nextInt(256)));
  }

  static List<int> _nonce(Uint8List prefix, int i, bool last) => [
        ...prefix,
        (i >> 24) & 0xff,
        (i >> 16) & 0xff,
        (i >> 8) & 0xff,
        i & 0xff,
        if (last) 1 else 0,
      ];

  static Future<Uint8List> encrypt(Uint8List plain, Uint8List key) async {
    final prefix = _random(7);
    final out = BytesBuilder(copy: false)
      ..add(const [0x4c, 0x42, 0x45, 0x31]) // "LBE1"
      ..add(prefix);
    final secret = SecretKey(key);
    final count = max(1, (plain.length + segment - 1) ~/ segment);
    for (var i = 0; i < count; i++) {
      final end = min(plain.length, (i + 1) * segment);
      final box = await _aes.encrypt(
        Uint8List.sublistView(plain, i * segment, end),
        secretKey: secret,
        nonce: _nonce(prefix, i, i == count - 1),
      );
      out
        ..add(box.cipherText)
        ..add(box.mac.bytes);
    }
    return out.takeBytes();
  }

  static Future<Uint8List> decrypt(Uint8List blob, Uint8List key) async {
    if (blob.length < _header + _tag ||
        blob[0] != 0x4c ||
        blob[1] != 0x42 ||
        blob[2] != 0x45 ||
        blob[3] != 0x31) {
      throw const FormatException('not an encrypted LawBid file');
    }
    final prefix = Uint8List.sublistView(blob, 4, _header);
    final secret = SecretKey(key);
    final out = BytesBuilder(copy: false);
    var at = _header;
    for (var i = 0; at < blob.length; i++) {
      final end = min(at + segment + _tag, blob.length);
      final last = end == blob.length;
      final seg = Uint8List.sublistView(blob, at, end);
      out.add(
        await _aes.decrypt(
          SecretBox(
            Uint8List.sublistView(seg, 0, seg.length - _tag),
            nonce: _nonce(prefix, i, last),
            mac: Mac(Uint8List.sublistView(seg, seg.length - _tag)),
          ),
          secretKey: secret,
        ),
      );
      at = end;
    }
    return out.takeBytes();
  }
}
