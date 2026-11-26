// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'e2ee_backup_put_dto.g.dart';

@JsonSerializable()
class E2eeBackupPutDto {
  const E2eeBackupPutDto({required this.fileId});

  factory E2eeBackupPutDto.fromJson(Map<String, Object?> json) =>
      _$E2eeBackupPutDtoFromJson(json);

  /// A clean chat_backup_e2ee file of mine.
  final String fileId;

  Map<String, Object?> toJson() => _$E2eeBackupPutDtoToJson(this);
}
