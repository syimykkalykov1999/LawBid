// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_assign_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachAssignDto _$OutreachAssignDtoFromJson(Map<String, dynamic> json) =>
    OutreachAssignDto(
      leadIds: (json['leadIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      partnerId: json['partnerId'] as String?,
    );

Map<String, dynamic> _$OutreachAssignDtoToJson(OutreachAssignDto instance) =>
    <String, dynamic>{
      'leadIds': instance.leadIds,
      'partnerId': ?instance.partnerId,
    };
