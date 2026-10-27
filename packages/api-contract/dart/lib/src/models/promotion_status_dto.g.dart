// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionStatusDto _$PromotionStatusDtoFromJson(Map<String, dynamic> json) =>
    PromotionStatusDto(
      manifestUrl: json['manifestUrl'] as String,
      manifest: json['manifest'] == null
          ? null
          : PromotionManifestDto.fromJson(
              json['manifest'] as Map<String, dynamic>,
            ),
      error: json['error'] as String?,
      checkedAt: json['checkedAt'] as String,
    );

Map<String, dynamic> _$PromotionStatusDtoToJson(PromotionStatusDto instance) =>
    <String, dynamic>{
      'manifestUrl': instance.manifestUrl,
      'manifest': ?instance.manifest?.toJson(),
      'error': ?instance.error,
      'checkedAt': instance.checkedAt,
    };
