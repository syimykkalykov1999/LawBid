import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/uploads/upload_hash_io.dart'
    if (dart.library.js_interop) 'package:lawbid/core/uploads/upload_hash_web.dart'
    as hash;

/// Owner 2026-10-22 (audit #4 §3): what is sent to storage — bytes in memory
/// (a picked photo, a sticker) or a file on the device (a recorded note, a
/// queued attachment, a video). A file is streamed, never read into memory
/// whole, so a long video does not spike the phone's RAM.
sealed class UploadBody {
  const UploadBody();

  /// Bytes already in memory.
  const factory UploadBody.bytes(Uint8List bytes) = BytesUploadBody;

  /// A file on the device ([XFile] also reads a browser blob URL).
  factory UploadBody.file(String path) = FileUploadBody;

  Future<int> length();

  /// Lowercase hex SHA-256 (the presign requires it), off the UI thread
  /// (media audit D9: an isolate on a phone, the browser's own digest).
  Future<String> sha256Hex();

  /// A fresh stream of the content (one per attempt: a retried POST cannot
  /// reuse a consumed stream).
  Stream<List<int>> open();

  /// A fresh stream of bytes [start, end) (one resumable-upload part).
  Stream<List<int>> openRange(int start, int end);

  /// The multipart file part of an S3 POST.
  Future<MultipartFile> multipart({
    required String filename,
    required String mime,
  }) async {
    final parts = mime.split('/');
    return MultipartFile.fromStream(
      open,
      await length(),
      filename: filename,
      contentType: DioMediaType(parts.first, parts.length > 1 ? parts[1] : ''),
    );
  }
}

final class BytesUploadBody extends UploadBody {
  const BytesUploadBody(this.bytes);

  final Uint8List bytes;

  @override
  Future<int> length() async => bytes.length;

  @override
  Future<String> sha256Hex() => hash.sha256OfBytes(bytes);

  @override
  Stream<List<int>> open() => Stream.value(bytes);

  @override
  Stream<List<int>> openRange(int start, int end) => Stream.value(
        Uint8List.sublistView(
          bytes,
          start,
          end.clamp(0, bytes.length),
        ),
      );
}

final class FileUploadBody extends UploadBody {
  FileUploadBody(this.path) : _file = XFile(path);

  final String path;
  final XFile _file;

  @override
  Future<int> length() => _file.length();

  @override
  Future<String> sha256Hex() => hash.sha256OfFile(path);

  @override
  Stream<List<int>> open() => _file.openRead();

  @override
  Stream<List<int>> openRange(int start, int end) => _file.openRead(start, end);
}

/// Lowercase hex SHA-256 of [bytes] (the presign requires it).
String sha256Hex(Uint8List bytes) => sha256.convert(bytes).toString();
