// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'e2ee_backup_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

E2eeBackupDto _$E2eeBackupDtoFromJson(Map<String, dynamic> json) =>
    E2eeBackupDto(
      fileId: json['fileId'] as String,
      sizeBytes: json['sizeBytes'] as num,
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      keyId: json['keyId'] as String?,
      url: json['url'] as String?,
    );

Map<String, dynamic> _$E2eeBackupDtoToJson(E2eeBackupDto instance) =>
    <String, dynamic>{
      'fileId': instance.fileId,
      'keyId': ?instance.keyId,
      'url': ?instance.url,
      'sizeBytes': instance.sizeBytes,
      'updatedAt': instance.updatedAt.toIso8601String(),
    };
