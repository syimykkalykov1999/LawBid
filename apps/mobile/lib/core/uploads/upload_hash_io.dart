import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

/// Media audit 13.11 (D9): a phone hashes in a background isolate, so a
/// long video (hundreds of MB through SHA-256) never stalls the UI thread.
/// Small payloads stay in place: starting an isolate costs more than them.
const kHashInPlaceBytes = 256 * 1024;

Future<String> sha256OfBytes(Uint8List bytes) async {
  if (bytes.length <= kHashInPlaceBytes) {
    return sha256.convert(bytes).toString();
  }
  return Isolate.run(() => sha256.convert(bytes).toString());
}

/// The file at [path], streamed (never whole in memory); inside the isolate
/// when it is over [kHashInPlaceBytes] (a voice note stays in place).
Future<String> sha256OfFile(String path) async {
  Future<String> hash() async =>
      (await sha256.bind(File(path).openRead()).first).toString();
  if (await File(path).length() <= kHashInPlaceBytes) return hash();
  return Isolate.run(hash);
}
