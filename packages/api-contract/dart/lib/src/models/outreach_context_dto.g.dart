// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_context_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachContextDto _$OutreachContextDtoFromJson(Map<String, dynamic> json) =>
    OutreachContextDto(
      scope: json['scope'] == null
          ? null
          : OutreachPartnerDto.fromJson(json['scope'] as Map<String, dynamic>),
      manager: json['manager'] as bool,
      partners: (json['partners'] as List<dynamic>)
          .map((e) => OutreachPartnerDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      settings: OutreachSettingsDto.fromJson(
        json['settings'] as Map<String, dynamic>,
      ),
      emailsLeftToday: json['emailsLeftToday'] as num,
    );

Map<String, dynamic> _$OutreachContextDtoToJson(OutreachContextDto instance) =>
    <String, dynamic>{
      'scope': ?instance.scope?.toJson(),
      'manager': instance.manager,
      'partners': instance.partners.map((e) => e.toJson()).toList(),
      'settings': instance.settings.toJson(),
      'emailsLeftToday': instance.emailsLeftToday,
    };
