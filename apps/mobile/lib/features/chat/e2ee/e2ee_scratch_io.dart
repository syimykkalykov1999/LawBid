import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_scratch.dart';
import 'package:path_provider/path_provider.dart';

E2eeScratch create() => _DiskScratch();

/// The phone: temp files for ciphertext on its way up, decrypted copies in
/// the app's cache folder (the OS's app sandbox), least recently used out
/// first past the budget.
class _DiskScratch implements E2eeScratch {
  final Map<String, E2eePlainFile> _kept = {};
  final Set<String> _own = {};
  Directory? _dir;

  Future<Directory> _folder() async {
    final d = _dir ??= Directory(
      '${(await getTemporaryDirectory()).path}${Platform.pathSeparator}e2ee',
    );
    if (!d.existsSync()) await d.create(recursive: true);
    return d;
  }

  String _name() {
    final r = Random.secure();
    return [
      for (var i = 0; i < 12; i++)
        r.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ].join();
  }

  Future<File> _write(Stream<List<int>> data) async {
    final f =
        File('${(await _folder()).path}${Platform.pathSeparator}${_name()}');
    final sink = f.openWrite();
    try {
      await sink.addStream(data);
      await sink.close();
    } on Object {
      await sink.close().catchError((Object _) {});
      if (f.existsSync()) await f.delete();
      rethrow;
    }
    return f;
  }

  @override
  Future<({UploadBody body, Future<void> Function() release})> hold(
    Stream<List<int>> data,
  ) async {
    final f = await _write(data);
    return (
      body: UploadBody.file(f.path),
      release: () async {
        if (f.existsSync()) await f.delete();
      },
    );
  }

  @override
  Future<E2eePlainFile> keep(String fileId, Stream<List<int>> data) async {
    final f = await _write(data);
    final kept = E2eePlainFile(length: await f.length(), path: f.path);
    _kept.remove(fileId);
    _kept[fileId] = kept;
    await _trim();
    return kept;
  }

  @override
  E2eePlainFile? kept(String fileId) {
    final k = _kept.remove(fileId);
    if (k == null) return null;
    if (k.path != null && !File(k.path!).existsSync()) return null;
    _kept[fileId] = k; // most recently used last
    return k;
  }

  @override
  Future<void> drop(String fileId) async {
    final k = _kept.remove(fileId);
    if (k?.path != null && !_own.remove(fileId)) {
      final f = File(k!.path!);
      if (f.existsSync()) await f.delete();
    }
  }

  @override
  void adopt(String fileId, E2eePlainFile file) {
    _kept[fileId] = file;
    _own.add(fileId);
  }

  Future<void> _trim() async {
    var total = 0;
    for (final k in _kept.values) {
      total += k.length;
    }
    while (total > E2eeScratch.plainBudgetBytes && _kept.length > 1) {
      final id = _kept.keys.first;
      final k = _kept.remove(id)!;
      total -= k.length;
      // The sender's own file is the user's, not a copy of ours.
      if (!_own.remove(id) && k.path != null) {
        final f = File(k.path!);
        if (f.existsSync()) await f.delete();
      }
    }
  }

  @override
  Future<void> clear() async {
    _kept.clear();
    _own.clear();
    final d = _dir;
    if (d != null && d.existsSync()) await d.delete(recursive: true);
  }
}
