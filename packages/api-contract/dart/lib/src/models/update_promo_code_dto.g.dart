// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_promo_code_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdatePromoCodeDto _$UpdatePromoCodeDtoFromJson(Map<String, dynamic> json) =>
    UpdatePromoCodeDto(
      description: json['description'] as String?,
      active: json['active'] as bool?,
      maxRedemptions: (json['maxRedemptions'] as num?)?.toInt(),
      expiresAt: json['expiresAt'] == null
          ? null
          : DateTime.parse(json['expiresAt'] as String),
    );

Map<String, dynamic> _$UpdatePromoCodeDtoToJson(UpdatePromoCodeDto instance) =>
    <String, dynamic>{
      'description': ?instance.description,
      'active': ?instance.active,
      'maxRedemptions': ?instance.maxRedemptions,
      'expiresAt': ?instance.expiresAt?.toIso8601String(),
    };
