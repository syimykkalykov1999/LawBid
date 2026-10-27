// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'billing_models_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BillingModelsDto _$BillingModelsDtoFromJson(Map<String, dynamic> json) =>
    BillingModelsDto(
      impressions: ModelPriceDto.fromJson(
        json['impressions'] as Map<String, dynamic>,
      ),
      reach: ModelPriceDto.fromJson(json['reach'] as Map<String, dynamic>),
      clicks: ModelPriceDto.fromJson(json['clicks'] as Map<String, dynamic>),
      actions: ModelPriceDto.fromJson(json['actions'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$BillingModelsDtoToJson(BillingModelsDto instance) =>
    <String, dynamic>{
      'impressions': instance.impressions.toJson(),
      'reach': instance.reach.toJson(),
      'clicks': instance.clicks.toJson(),
      'actions': instance.actions.toJson(),
    };
