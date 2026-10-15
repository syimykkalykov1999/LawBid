// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_tasks_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseTasksDto _$CaseTasksDtoFromJson(Map<String, dynamic> json) => CaseTasksDto(
  role: CaseTasksDtoRole.fromJson(json['role'] as String),
  forClient: (json['forClient'] as List<dynamic>)
      .map((e) => CaseTaskDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  shared: (json['shared'] as List<dynamic>)
      .map((e) => CaseTaskDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  joint: (json['joint'] as List<dynamic>)
      .map((e) => CaseTaskDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  private: (json['private'] as List<dynamic>)
      .map((e) => CaseTaskDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$CaseTasksDtoToJson(CaseTasksDto instance) =>
    <String, dynamic>{
      'role': instance.role.toJson(),
      'forClient': instance.forClient.map((e) => e.toJson()).toList(),
      'shared': instance.shared.map((e) => e.toJson()).toList(),
      'joint': instance.joint.map((e) => e.toJson()).toList(),
      'private': instance.private.map((e) => e.toJson()).toList(),
    };
