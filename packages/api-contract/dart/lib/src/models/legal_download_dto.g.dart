// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_download_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalDownloadDto _$LegalDownloadDtoFromJson(Map<String, dynamic> json) =>
    LegalDownloadDto(
      url: json['url'] as String,
      expiresAt: json['expiresAt'] as String,
      sha256: json['sha256'] as String?,
    );

Map<String, dynamic> _$LegalDownloadDtoToJson(LegalDownloadDto instance) =>
    <String, dynamic>{
      'url': instance.url,
      'expiresAt': instance.expiresAt,
      'sha256': ?instance.sha256,
    };
