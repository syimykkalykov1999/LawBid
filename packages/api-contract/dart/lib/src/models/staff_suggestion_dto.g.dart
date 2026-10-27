// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_suggestion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffSuggestionDto _$StaffSuggestionDtoFromJson(Map<String, dynamic> json) =>
    StaffSuggestionDto(
      id: json['id'] as String,
      adminId: json['adminId'] as String,
      name: json['name'] as String,
      workspace: StaffWorkspaceName.fromJson(json['workspace'] as String),
      kind: StaffSuggestionKind.fromJson(json['kind'] as String),
      status: StaffSuggestionStatus.fromJson(json['status'] as String),
      snapshotDate: json['snapshotDate'] as String,
      evidence: json['evidence'],
      createdAt: json['createdAt'] as String,
    );

Map<String, dynamic> _$StaffSuggestionDtoToJson(StaffSuggestionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'adminId': instance.adminId,
      'name': instance.name,
      'workspace': instance.workspace.toJson(),
      'kind': instance.kind.toJson(),
      'status': instance.status.toJson(),
      'snapshotDate': instance.snapshotDate,
      'evidence': ?instance.evidence,
      'createdAt': instance.createdAt,
    };
