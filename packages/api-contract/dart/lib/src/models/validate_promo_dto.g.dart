// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'validate_promo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ValidatePromoDto _$ValidatePromoDtoFromJson(Map<String, dynamic> json) =>
    ValidatePromoDto(
      code: json['code'] as String,
      appliesTo: PromoPurchase.fromJson(json['appliesTo'] as String),
    );

Map<String, dynamic> _$ValidatePromoDtoToJson(ValidatePromoDto instance) =>
    <String, dynamic>{
      'code': instance.code,
      'appliesTo': instance.appliesTo.toJson(),
    };
