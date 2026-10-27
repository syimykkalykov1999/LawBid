// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_today_appeal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffTodayAppealDto _$StaffTodayAppealDtoFromJson(Map<String, dynamic> json) =>
    StaffTodayAppealDto(
      id: json['id'] as String,
      number: json['number'] as num,
      kind: json['kind'] as String,
      status: StaffTodayAppealDtoStatus.fromJson(json['status'] as String),
      headName: json['headName'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$StaffTodayAppealDtoToJson(
  StaffTodayAppealDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'number': instance.number,
  'kind': instance.kind,
  'status': instance.status.toJson(),
  'headName': instance.headName,
  'createdAt': instance.createdAt.toIso8601String(),
};
