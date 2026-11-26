import 'dart:async';
import 'dart:typed_data';

import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_scratch.dart';

E2eeScratch create() => _MemoryScratch();

/// The browser has no files of its own: the ciphertext and the decrypted
/// copies are bytes, the copies capped by their total size (least recently
/// used out first).
class _MemoryScratch implements E2eeScratch {
  final Map<String, E2eePlainFile> _kept = {};

  /// The browser's budget is smaller than a phone's disk one.
  static const _budget = 128 * 1024 * 1024;

  static Future<Uint8List> _collect(Stream<List<int>> data) async {
    final out = BytesBuilder(copy: false);
    await for (final c in data) {
      out.add(c);
    }
    return out.takeBytes();
  }

  @override
  Future<({UploadBody body, Future<void> Function() release})> hold(
    Stream<List<int>> data,
  ) async =>
      (body: UploadBody.bytes(await _collect(data)), release: () async {});

  @override
  Future<E2eePlainFile> keep(String fileId, Stream<List<int>> data) async {
    final bytes = await _collect(data);
    final k = E2eePlainFile(length: bytes.length, bytes: bytes);
    _kept.remove(fileId);
    _kept[fileId] = k;
    var total = 0;
    for (final v in _kept.values) {
      total += v.length;
    }
    while (total > _budget && _kept.length > 1) {
      total -= _kept.remove(_kept.keys.first)!.length;
    }
    return k;
  }

  @override
  E2eePlainFile? kept(String fileId) {
    final k = _kept.remove(fileId);
    if (k != null) _kept[fileId] = k;
    return k;
  }

  @override
  Future<void> drop(String fileId) async => _kept.remove(fileId);

  @override
  void adopt(String fileId, E2eePlainFile file) => _kept[fileId] = file;

  @override
  Future<void> clear() async => _kept.clear();
}
