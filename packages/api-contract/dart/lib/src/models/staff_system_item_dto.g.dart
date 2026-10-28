// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_system_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffSystemItemDto _$StaffSystemItemDtoFromJson(Map<String, dynamic> json) =>
    StaffSystemItemDto(
      code: json['code'] as String,
      severity: StaffSystemItemDtoSeverity.fromJson(json['severity'] as String),
      title: json['title'] as String,
      why: json['why'] as String,
      action: StaffSystemActionDto.fromJson(
        json['action'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$StaffSystemItemDtoToJson(StaffSystemItemDto instance) =>
    <String, dynamic>{
      'code': instance.code,
      'severity': instance.severity.toJson(),
      'title': instance.title,
      'why': instance.why,
      'action': instance.action.toJson(),
    };
