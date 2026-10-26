// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'integration_slot_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IntegrationSlotDto _$IntegrationSlotDtoFromJson(
  Map<String, dynamic> json,
) => IntegrationSlotDto(
  slot: json['slot'] as String,
  priority: json['priority'] as num,
  enabled: json['enabled'] as bool,
  label: json['label'] as String?,
  active: json['active'] == null
      ? null
      : IntegrationVersionDto.fromJson(json['active'] as Map<String, dynamic>),
  pending: json['pending'] == null
      ? null
      : IntegrationVersionDto.fromJson(json['pending'] as Map<String, dynamic>),
);

Map<String, dynamic> _$IntegrationSlotDtoToJson(IntegrationSlotDto instance) =>
    <String, dynamic>{
      'slot': instance.slot,
      'label': ?instance.label,
      'priority': instance.priority,
      'enabled': instance.enabled,
      'active': ?instance.active?.toJson(),
      'pending': ?instance.pending?.toJson(),
    };
