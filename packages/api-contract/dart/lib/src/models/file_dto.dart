// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'file_purpose.dart';
import 'scan_status.dart';

part 'file_dto.g.dart';

@JsonSerializable()
class FileDto {
  const FileDto({
    required this.id,
    required this.purpose,
    required this.mime,
    required this.sizeBytes,
    required this.width,
    required this.height,
    required this.scanStatus,
    required this.url,
    required this.createdAt,
  });

  factory FileDto.fromJson(Map<String, Object?> json) =>
      _$FileDtoFromJson(json);

  final String id;
  final FilePurpose purpose;

  /// Real type (magic bytes); HEIC becomes image/jpeg once processed.
  final String mime;
  final num sizeBytes;
  final num? width;
  final num? height;

  /// Only `clean` files can be attached (avatar, verification, posts).
  final ScanStatus scanStatus;

  /// Short-lived signed link — only for clean avatar/post images. Verification files are never served to the app (docs/03 §2.2).
  final String? url;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$FileDtoToJson(this);
}
