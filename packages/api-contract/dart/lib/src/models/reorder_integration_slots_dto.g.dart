// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reorder_integration_slots_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReorderIntegrationSlotsDto _$ReorderIntegrationSlotsDtoFromJson(
  Map<String, dynamic> json,
) => ReorderIntegrationSlotsDto(
  slots: (json['slots'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$ReorderIntegrationSlotsDtoToJson(
  ReorderIntegrationSlotsDto instance,
) => <String, dynamic>{'slots': instance.slots};
