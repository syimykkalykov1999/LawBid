// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'partner_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PartnerSettingsDto _$PartnerSettingsDtoFromJson(Map<String, dynamic> json) =>
    PartnerSettingsDto(
      enabled: json['enabled'] as bool,
      attorneyRateCents: (json['attorneyRateCents'] as num).toInt(),
      clientRateCents: (json['clientRateCents'] as num).toInt(),
      clientRule: PartnerClientRule.fromJson(json['clientRule'] as String),
      holdDays: (json['holdDays'] as num).toInt(),
      texts: PartnerTextsByLangDto.fromJson(
        json['texts'] as Map<String, dynamic>,
      ),
      joinMode: json['joinMode'] == null
          ? null
          : PartnerJoinMode.fromJson(json['joinMode'] as String),
      requireW9: json['requireW9'] as bool?,
    );

Map<String, dynamic> _$PartnerSettingsDtoToJson(PartnerSettingsDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'joinMode': ?instance.joinMode?.toJson(),
      'attorneyRateCents': instance.attorneyRateCents,
      'clientRateCents': instance.clientRateCents,
      'clientRule': instance.clientRule.toJson(),
      'holdDays': instance.holdDays,
      'requireW9': ?instance.requireW9,
      'texts': instance.texts.toJson(),
    };
