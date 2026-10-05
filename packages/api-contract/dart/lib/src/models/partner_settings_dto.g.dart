// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'partner_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PartnerSettingsDto _$PartnerSettingsDtoFromJson(Map<String, dynamic> json) =>
    PartnerSettingsDto(
      enabled: json['enabled'] as bool,
      selfEnroll: json['selfEnroll'] as bool,
      attorneyRateCents: (json['attorneyRateCents'] as num).toInt(),
      clientRateCents: (json['clientRateCents'] as num).toInt(),
      clientRule: PartnerClientRule.fromJson(json['clientRule'] as String),
      holdDays: (json['holdDays'] as num).toInt(),
      texts: PartnerTextsByLangDto.fromJson(
        json['texts'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$PartnerSettingsDtoToJson(PartnerSettingsDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'selfEnroll': instance.selfEnroll,
      'attorneyRateCents': instance.attorneyRateCents,
      'clientRateCents': instance.clientRateCents,
      'clientRule': instance.clientRule.toJson(),
      'holdDays': instance.holdDays,
      'texts': instance.texts.toJson(),
    };
