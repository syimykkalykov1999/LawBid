// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_action_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffActionRowDto _$StaffActionRowDtoFromJson(Map<String, dynamic> json) =>
    StaffActionRowDto(
      id: json['id'] as String,
      kind: json['kind'] as String,
      source: json['source'] as String,
      reasonCode: json['reasonCode'] as String,
      reasonNote: json['reasonNote'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$StaffActionRowDtoToJson(StaffActionRowDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'kind': instance.kind,
      'source': instance.source,
      'reasonCode': instance.reasonCode,
      'reasonNote': ?instance.reasonNote,
      'createdAt': instance.createdAt.toIso8601String(),
    };
