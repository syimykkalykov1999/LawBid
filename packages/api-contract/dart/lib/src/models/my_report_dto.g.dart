// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'my_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MyReportDto _$MyReportDtoFromJson(Map<String, dynamic> json) => MyReportDto(
  id: json['id'] as String,
  targetType: MyReportDtoTargetType.fromJson(json['targetType'] as String),
  reason: json['reason'] as String,
  status: MyReportDtoStatus.fromJson(json['status'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$MyReportDtoToJson(MyReportDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'targetType': instance.targetType.toJson(),
      'reason': instance.reason,
      'status': instance.status.toJson(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
