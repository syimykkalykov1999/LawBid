// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'multipart_plan_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MultipartPlanDto _$MultipartPlanDtoFromJson(Map<String, dynamic> json) =>
    MultipartPlanDto(
      partSizeBytes: json['partSizeBytes'] as num,
      partCount: json['partCount'] as num,
      uploadedParts: (json['uploadedParts'] as List<dynamic>)
          .map((e) => e as num)
          .toList(),
      parts: (json['parts'] as List<dynamic>)
          .map((e) => MultipartPartDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      expiresAt: DateTime.parse(json['expiresAt'] as String),
    );

Map<String, dynamic> _$MultipartPlanDtoToJson(MultipartPlanDto instance) =>
    <String, dynamic>{
      'partSizeBytes': instance.partSizeBytes,
      'partCount': instance.partCount,
      'uploadedParts': instance.uploadedParts,
      'parts': instance.parts.map((e) => e.toJson()).toList(),
      'expiresAt': instance.expiresAt.toIso8601String(),
    };
