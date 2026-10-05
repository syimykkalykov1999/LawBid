// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'copy_state_registry_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CopyStateRegistryDto _$CopyStateRegistryDtoFromJson(
  Map<String, dynamic> json,
) => CopyStateRegistryDto(
  states: (json['states'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$CopyStateRegistryDtoToJson(
  CopyStateRegistryDto instance,
) => <String, dynamic>{'states': instance.states};
