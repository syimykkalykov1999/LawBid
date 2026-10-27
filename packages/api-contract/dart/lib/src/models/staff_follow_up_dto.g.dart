// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_follow_up_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffFollowUpDto _$StaffFollowUpDtoFromJson(Map<String, dynamic> json) =>
    StaffFollowUpDto(
      call: json['call'] as String,
      target: StaffFollowUpDtoTarget.fromJson(json['target'] as String),
      applied: json['applied'] as bool,
    );

Map<String, dynamic> _$StaffFollowUpDtoToJson(StaffFollowUpDto instance) =>
    <String, dynamic>{
      'call': instance.call,
      'target': instance.target.toJson(),
      'applied': instance.applied,
    };
