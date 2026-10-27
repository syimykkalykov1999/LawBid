// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_create_appeal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffCreateAppealDto _$StaffCreateAppealDtoFromJson(
  Map<String, dynamic> json,
) => StaffCreateAppealDto(
  text: json['text'] as String,
  kind: json['kind'] == null
      ? StaffCreateAppealDtoKind.other
      : StaffCreateAppealDtoKind.fromJson(json['kind'] as String),
  anonymous: json['anonymous'] as bool? ?? false,
);

Map<String, dynamic> _$StaffCreateAppealDtoToJson(
  StaffCreateAppealDto instance,
) => <String, dynamic>{
  'kind': instance.kind.toJson(),
  'text': instance.text,
  'anonymous': instance.anonymous,
};
