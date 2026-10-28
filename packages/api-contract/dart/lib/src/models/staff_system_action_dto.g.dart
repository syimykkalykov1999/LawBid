// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_system_action_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffSystemActionDto _$StaffSystemActionDtoFromJson(
  Map<String, dynamic> json,
) => StaffSystemActionDto(
  kind: StaffSystemActionDtoKind.fromJson(json['kind'] as String),
  target: json['target'] as String,
  label: json['label'] as String,
);

Map<String, dynamic> _$StaffSystemActionDtoToJson(
  StaffSystemActionDto instance,
) => <String, dynamic>{
  'kind': instance.kind.toJson(),
  'target': instance.target,
  'label': instance.label,
};
