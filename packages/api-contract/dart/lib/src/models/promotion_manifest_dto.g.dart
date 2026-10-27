// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_manifest_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionManifestDto _$PromotionManifestDtoFromJson(
  Map<String, dynamic> json,
) => PromotionManifestDto(
  builtAt: json['builtAt'] as String?,
  pages: json['pages'] as num,
  indexed: json['indexed'] as num,
  noindex: json['noindex'] as num,
  rampPerDay: json['rampPerDay'] as num?,
  rampDeferred: json['rampDeferred'] as num?,
);

Map<String, dynamic> _$PromotionManifestDtoToJson(
  PromotionManifestDto instance,
) => <String, dynamic>{
  'builtAt': ?instance.builtAt,
  'pages': instance.pages,
  'indexed': instance.indexed,
  'noindex': instance.noindex,
  'rampPerDay': ?instance.rampPerDay,
  'rampDeferred': ?instance.rampDeferred,
};
