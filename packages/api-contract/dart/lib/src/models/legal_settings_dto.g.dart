// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalSettingsDto _$LegalSettingsDtoFromJson(
  Map<String, dynamic> json,
) => LegalSettingsDto(
  dmcaAgent: DmcaAgentDto.fromJson(json['dmcaAgent'] as Map<String, dynamic>),
  incidentContact: IncidentContactDto.fromJson(
    json['incidentContact'] as Map<String, dynamic>,
  ),
  dmcaStrikesToSuspend: (json['dmcaStrikesToSuspend'] as num).toInt(),
  texts: LegalTextsByLangDto.fromJson(json['texts'] as Map<String, dynamic>),
);

Map<String, dynamic> _$LegalSettingsDtoToJson(LegalSettingsDto instance) =>
    <String, dynamic>{
      'dmcaAgent': instance.dmcaAgent.toJson(),
      'incidentContact': instance.incidentContact.toJson(),
      'dmcaStrikesToSuspend': instance.dmcaStrikesToSuspend,
      'texts': instance.texts.toJson(),
    };
