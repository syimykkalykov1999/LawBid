// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'e2ee_backup_dto.g.dart';

@JsonSerializable()
class E2eeBackupDto {
  const E2eeBackupDto({
    required this.fileId,
    required this.sizeBytes,
    required this.updatedAt,
    this.keyId,
    this.url,
  });

  factory E2eeBackupDto.fromJson(Map<String, Object?> json) =>
      _$E2eeBackupDtoFromJson(json);

  final String fileId;

  /// Which key locks the backup (E2eeBackupPutDto.keyId).
  final String? keyId;
  final String? url;
  final num sizeBytes;
  final DateTime updatedAt;

  Map<String, Object?> toJson() => _$E2eeBackupDtoToJson(this);
}
