// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachSettingsDto _$OutreachSettingsDtoFromJson(Map<String, dynamic> json) =>
    OutreachSettingsDto(
      dailyEmailLimit: json['dailyEmailLimit'] as num,
      fromName: json['fromName'] as String,
      footerAddress: json['footerAddress'] as String,
      apiPublicUrl: json['apiPublicUrl'] as String,
    );

Map<String, dynamic> _$OutreachSettingsDtoToJson(
  OutreachSettingsDto instance,
) => <String, dynamic>{
  'dailyEmailLimit': instance.dailyEmailLimit,
  'fromName': instance.fromName,
  'footerAddress': instance.footerAddress,
  'apiPublicUrl': instance.apiPublicUrl,
};
