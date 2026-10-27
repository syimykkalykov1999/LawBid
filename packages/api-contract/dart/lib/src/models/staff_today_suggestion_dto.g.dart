// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_today_suggestion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffTodaySuggestionDto _$StaffTodaySuggestionDtoFromJson(
  Map<String, dynamic> json,
) => StaffTodaySuggestionDto(
  id: json['id'] as String,
  adminId: json['adminId'] as String,
  name: json['name'] as String,
  workspace: StaffTodaySuggestionDtoWorkspace.fromJson(
    json['workspace'] as String,
  ),
  kind: json['kind'] as String,
  createdAt: DateTime.parse(json['createdAt'] as String),
  recommendation: StaffRecommendationDto.fromJson(
    json['recommendation'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$StaffTodaySuggestionDtoToJson(
  StaffTodaySuggestionDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'adminId': instance.adminId,
  'name': instance.name,
  'workspace': instance.workspace.toJson(),
  'kind': instance.kind,
  'createdAt': instance.createdAt.toIso8601String(),
  'recommendation': instance.recommendation.toJson(),
};
