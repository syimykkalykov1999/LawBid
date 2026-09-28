// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'document_url_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DocumentUrlDto _$DocumentUrlDtoFromJson(Map<String, dynamic> json) =>
    DocumentUrlDto(
      url: json['url'] as String,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
    );

Map<String, dynamic> _$DocumentUrlDtoToJson(DocumentUrlDto instance) =>
    <String, dynamic>{
      'url': instance.url,
      'expiresAt': instance.expiresAt.toIso8601String(),
    };
