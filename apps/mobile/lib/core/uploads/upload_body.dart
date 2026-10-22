import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart' show XFile;

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

  /// Lowercase hex SHA-256 (the presign requires it).
  Future<String> sha256Hex();

  /// A fresh stream of the content (one per attempt: a retried POST cannot
  /// reuse a consumed stream).
  Stream<List<int>> open();

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
  Future<String> sha256Hex() async => sha256.convert(bytes).toString();

  @override
  Stream<List<int>> open() => Stream.value(bytes);
}

final class FileUploadBody extends UploadBody {
  FileUploadBody(this.path) : _file = XFile(path);

  final String path;
  final XFile _file;

  @override
  Future<int> length() => _file.length();

  @override
  Future<String> sha256Hex() async =>
      (await sha256.bind(_file.openRead()).first).toString();

  @override
  Stream<List<int>> open() => _file.openRead();
}

/// Lowercase hex SHA-256 of [bytes] (the presign requires it).
String sha256Hex(Uint8List bytes) => sha256.convert(bytes).toString();
