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
      clientLeadsEnabled: json['clientLeadsEnabled'] as bool?,
      dncConfirmed: json['dncConfirmed'] as bool?,
      dncSan: json['dncSan'] as String?,
      callHoursStart: json['callHoursStart'] as num?,
      callHoursEnd: json['callHoursEnd'] as num?,
      maxEmailsPerLead: json['maxEmailsPerLead'] as num?,
      emailCooldownDays: json['emailCooldownDays'] as num?,
      leadRetentionDays: json['leadRetentionDays'] as num?,
    );

Map<String, dynamic> _$OutreachSettingsDtoToJson(
  OutreachSettingsDto instance,
) => <String, dynamic>{
  'dailyEmailLimit': instance.dailyEmailLimit,
  'fromName': instance.fromName,
  'footerAddress': instance.footerAddress,
  'apiPublicUrl': instance.apiPublicUrl,
  'clientLeadsEnabled': ?instance.clientLeadsEnabled,
  'dncConfirmed': ?instance.dncConfirmed,
  'dncSan': ?instance.dncSan,
  'callHoursStart': ?instance.callHoursStart,
  'callHoursEnd': ?instance.callHoursEnd,
  'maxEmailsPerLead': ?instance.maxEmailsPerLead,
  'emailCooldownDays': ?instance.emailCooldownDays,
  'leadRetentionDays': ?instance.leadRetentionDays,
};
