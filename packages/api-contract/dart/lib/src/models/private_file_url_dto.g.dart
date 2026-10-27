// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'private_file_url_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PrivateFileUrlDto _$PrivateFileUrlDtoFromJson(Map<String, dynamic> json) =>
    PrivateFileUrlDto(
      url: json['url'] as String,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
    );

Map<String, dynamic> _$PrivateFileUrlDtoToJson(PrivateFileUrlDto instance) =>
    <String, dynamic>{
      'url': instance.url,
      'expiresAt': instance.expiresAt.toIso8601String(),
    };
