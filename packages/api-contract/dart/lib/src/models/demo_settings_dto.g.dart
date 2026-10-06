// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'demo_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DemoSettingsDto _$DemoSettingsDtoFromJson(Map<String, dynamic> json) =>
    DemoSettingsDto(
      enabled: json['enabled'] as bool,
      ttlDays: json['ttlDays'] as num,
      maxAccountsPerPartner: json['maxAccountsPerPartner'] as num,
      autoClean: json['autoClean'] as bool,
      uploadQuotaMb: json['uploadQuotaMb'] as num,
      bannerText: DemoBannerTextDto.fromJson(
        json['bannerText'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$DemoSettingsDtoToJson(DemoSettingsDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'ttlDays': instance.ttlDays,
      'maxAccountsPerPartner': instance.maxAccountsPerPartner,
      'autoClean': instance.autoClean,
      'uploadQuotaMb': instance.uploadQuotaMb,
      'bannerText': instance.bannerText.toJson(),
    };
