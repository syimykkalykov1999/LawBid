// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'team_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TeamDto _$TeamDtoFromJson(Map<String, dynamic> json) => TeamDto(
  members: (json['members'] as List<dynamic>)
      .map((e) => AssistantMemberDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  seats: (json['seats'] as num).toInt(),
  used: (json['used'] as num).toInt(),
  plan: TeamDtoPlan.fromJson(json['plan'] as String),
);

Map<String, dynamic> _$TeamDtoToJson(TeamDto instance) => <String, dynamic>{
  'members': instance.members.map((e) => e.toJson()).toList(),
  'seats': instance.seats,
  'used': instance.used,
  'plan': instance.plan.toJson(),
};
