// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upload_place_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UploadPlaceDto _$UploadPlaceDtoFromJson(
  Map<String, dynamic> json,
) => UploadPlaceDto(
  limits: UploadPlaceLimitsDto.fromJson(json['limits'] as Map<String, dynamic>),
  count: UploadCountMode.fromJson(json['count'] as String),
  safeFormats: (json['safeFormats'] as List<dynamic>)
      .map((e) => UploadFormat.fromJson(e as String))
      .toList(),
  ceiling: UploadCeilingDto.fromJson(json['ceiling'] as Map<String, dynamic>),
  defaults: UploadPlaceLimitsDto.fromJson(
    json['defaults'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$UploadPlaceDtoToJson(UploadPlaceDto instance) =>
    <String, dynamic>{
      'limits': instance.limits.toJson(),
      'count': instance.count.toJson(),
      'safeFormats': instance.safeFormats.map((e) => e.toJson()).toList(),
      'ceiling': instance.ceiling.toJson(),
      'defaults': instance.defaults.toJson(),
    };
