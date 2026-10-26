// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'firm_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FirmDto _$FirmDtoFromJson(Map<String, dynamic> json) => FirmDto(
  id: json['id'] as String,
  name: json['name'] as String,
  ownerId: json['ownerId'] as String,
  states: (json['states'] as List<dynamic>).map((e) => e as String).toList(),
  members: (json['members'] as List<dynamic>)
      .map((e) => FirmMemberDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$FirmDtoToJson(FirmDto instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'ownerId': instance.ownerId,
  'states': instance.states,
  'members': instance.members.map((e) => e.toJson()).toList(),
};
