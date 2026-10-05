// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_agent_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportAgentDto _$SupportAgentDtoFromJson(Map<String, dynamic> json) =>
    SupportAgentDto(
      adminId: json['adminId'] as String,
      name: json['name'] as String,
      onShift: json['onShift'] as bool,
      maxOpen: json['maxOpen'] as num,
      openTickets: json['openTickets'] as num,
    );

Map<String, dynamic> _$SupportAgentDtoToJson(SupportAgentDto instance) =>
    <String, dynamic>{
      'adminId': instance.adminId,
      'name': instance.name,
      'onShift': instance.onShift,
      'maxOpen': instance.maxOpen,
      'openTickets': instance.openTickets,
    };
