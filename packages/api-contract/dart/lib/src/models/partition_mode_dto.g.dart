// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'partition_mode_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PartitionModeDto _$PartitionModeDtoFromJson(Map<String, dynamic> json) =>
    PartitionModeDto(
      mode: PartitionModeDtoMode.fromJson(json['mode'] as String),
    );

Map<String, dynamic> _$PartitionModeDtoToJson(PartitionModeDto instance) =>
    <String, dynamic>{'mode': instance.mode.toJson()};
