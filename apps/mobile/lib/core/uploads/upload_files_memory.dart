import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lawbid/core/uploads/upload_files.dart';

UploadFiles createUploadFiles() => MemoryUploadFiles();

/// The browser (and tests): the bytes stay in this tab's memory. A reload
/// loses them; the job then shows «not sent» with Delete.
class MemoryUploadFiles implements UploadFiles {
  final _files = <String, Uint8List>{};

  @override
  Future<String> keep(
    String name, {
    Uint8List? bytes,
    String? fromPath,
    bool move = false,
  }) async {
    if (bytes != null) {
      _files[name] = bytes;
    } else if (fromPath != null) {
      // A browser recording is a blob: URL.
      final res = await Dio().get<List<int>>(
        fromPath,
        options: Options(responseType: ResponseType.bytes),
      );
      _files[name] = Uint8List.fromList(res.data ?? const []);
    }
    return name;
  }

  @override
  Future<String?> pathOf(String name) async => null;

  @override
  Future<Uint8List?> read(String name) async => _files[name];

  @override
  Future<void> remove(String name) async => _files.remove(name);
}
