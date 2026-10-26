// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upload_place_limits_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UploadPlaceLimitsDto _$UploadPlaceLimitsDtoFromJson(
  Map<String, dynamic> json,
) => UploadPlaceLimitsDto(
  place: UploadPlace.fromJson(json['place'] as String),
  maxPhotos: json['maxPhotos'] as num,
  maxFiles: json['maxFiles'] as num,
  fileMb: json['fileMb'] as num,
  totalMb: json['totalMb'] as num,
  formats: (json['formats'] as List<dynamic>)
      .map((e) => UploadFormat.fromJson(e as String))
      .toList(),
);

Map<String, dynamic> _$UploadPlaceLimitsDtoToJson(
  UploadPlaceLimitsDto instance,
) => <String, dynamic>{
  'place': instance.place.toJson(),
  'maxPhotos': instance.maxPhotos,
  'maxFiles': instance.maxFiles,
  'fileMb': instance.fileMb,
  'totalMb': instance.totalMb,
  'formats': instance.formats.map((e) => e.toJson()).toList(),
};
