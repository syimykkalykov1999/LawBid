// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'presigned_upload_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PresignedUploadDto _$PresignedUploadDtoFromJson(Map<String, dynamic> json) =>
    PresignedUploadDto(
      url: json['url'] as String,
      fields: Map<String, String>.from(json['fields'] as Map),
      method: json['method'] == null
          ? null
          : PresignedUploadDtoMethod.fromJson(json['method'] as String),
      headers: (json['headers'] as Map<String, dynamic>?)?.map(
        (k, e) => MapEntry(k, e as String),
      ),
    );

Map<String, dynamic> _$PresignedUploadDtoToJson(PresignedUploadDto instance) =>
    <String, dynamic>{
      'url': instance.url,
      'fields': instance.fields,
      'method': ?instance.method?.toJson(),
      'headers': ?instance.headers,
    };
