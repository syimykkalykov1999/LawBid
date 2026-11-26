import 'dart:async';
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
///
/// [encryptStream] / [decryptStream] work one segment at a time, so a large
/// video goes from disk to disk without being held in memory (Tink's
/// streaming AEAD, WhatsApp's media pipeline).
abstract final class E2eeFile {
  static const segment = 64 * 1024;
  static const _tag = 16;
  static const _header = 11;
  static const _magic = [0x4c, 0x42, 0x45, 0x31]; // "LBE1"
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

  /// The ciphertext size of a [plainLength]-byte file.
  static int sealedLength(int plainLength) =>
      _header +
      plainLength +
      max(1, (plainLength + segment - 1) ~/ segment) * _tag;

  /// Reads [source] in pieces of [size] bytes and tells, for each, whether
  /// it is the last one (one piece of look-ahead; an empty source gives
  /// one empty last piece).
  static Stream<(Uint8List, bool)> _pieces(
    Stream<List<int>> source,
    int size,
  ) async* {
    var buf = BytesBuilder(copy: false);
    Uint8List? ready;
    await for (final chunk in source) {
      var at = 0;
      while (at < chunk.length) {
        final take = min(size - buf.length, chunk.length - at);
        final bytes = chunk is Uint8List ? chunk : Uint8List.fromList(chunk);
        buf.add(Uint8List.sublistView(bytes, at, at + take));
        at += take;
        if (buf.length == size) {
          if (ready != null) yield (ready, false);
          ready = buf.takeBytes();
          buf = BytesBuilder(copy: false);
        }
      }
    }
    if (buf.length > 0) {
      if (ready != null) yield (ready, false);
      yield (buf.takeBytes(), true);
    } else {
      yield (ready ?? Uint8List(0), true);
    }
  }

  /// The encrypted form of [plain], segment by segment.
  static Stream<List<int>> encryptStream(
    Stream<List<int>> plain,
    Uint8List key,
  ) async* {
    final prefix = _random(7);
    yield [..._magic, ...prefix];
    final secret = SecretKey(key);
    var i = 0;
    await for (final (piece, last) in _pieces(plain, segment)) {
      final box = await _aes.encrypt(
        piece,
        secretKey: secret,
        nonce: _nonce(prefix, i, last),
      );
      yield box.cipherText;
      yield box.mac.bytes;
      i++;
    }
  }

  /// The plaintext of [blob], segment by segment; throws on a wrong key,
  /// a changed byte or a cut-off end (the last segment is marked).
  static Stream<List<int>> decryptStream(
    Stream<List<int>> blob,
    Uint8List key,
  ) async* {
    final secret = SecretKey(key);
    Uint8List? prefix;
    var head = BytesBuilder(copy: false);
    final rest = StreamController<List<int>>();
    // The header first, then the segments (each segment + its tag).
    final sub = blob.listen(
      (chunk) {
        if (prefix != null) {
          rest.add(chunk);
          return;
        }
        head.add(chunk);
        if (head.length < _header) return;
        final h = head.takeBytes();
        head = BytesBuilder(copy: false);
        for (var j = 0; j < 4; j++) {
          if (h[j] != _magic[j]) {
            rest.addError(
              const FormatException('not an encrypted LawBid file'),
            );
            return;
          }
        }
        prefix = Uint8List.sublistView(h, 4, _header);
        if (h.length > _header) rest.add(Uint8List.sublistView(h, _header));
      },
      onError: rest.addError,
      onDone: () {
        if (prefix == null) {
          rest.addError(const FormatException('not an encrypted LawBid file'));
        }
        rest.close();
      },
    );
    try {
      var i = 0;
      await for (final (seg, last) in _pieces(rest.stream, segment + _tag)) {
        if (seg.length < _tag) {
          throw const FormatException('a cut-off encrypted file');
        }
        yield await _aes.decrypt(
          SecretBox(
            Uint8List.sublistView(seg, 0, seg.length - _tag),
            nonce: _nonce(prefix!, i, last),
            mac: Mac(Uint8List.sublistView(seg, seg.length - _tag)),
          ),
          secretKey: secret,
        );
        i++;
      }
    } finally {
      await sub.cancel();
    }
  }

  static Future<Uint8List> _collect(Stream<List<int>> s) async {
    final out = BytesBuilder(copy: false);
    await for (final c in s) {
      out.add(c);
    }
    return out.takeBytes();
  }

  static Future<Uint8List> encrypt(Uint8List plain, Uint8List key) =>
      _collect(encryptStream(Stream.value(plain), key));

  static Future<Uint8List> decrypt(Uint8List blob, Uint8List key) async {
    if (blob.length < _header + _tag) {
      throw const FormatException('not an encrypted LawBid file');
    }
    return _collect(decryptStream(Stream.value(blob), key));
  }
}
