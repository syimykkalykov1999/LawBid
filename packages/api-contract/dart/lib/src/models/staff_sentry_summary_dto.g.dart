// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_sentry_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffSentrySummaryDto _$StaffSentrySummaryDtoFromJson(
  Map<String, dynamic> json,
) => StaffSentrySummaryDto(
  state: StaffSentrySummaryDtoState.fromJson(json['state'] as String),
  unresolved: (json['unresolved'] as num).toInt(),
  unresolvedAtLeast: json['unresolvedAtLeast'] as bool,
  newCount: (json['newCount'] as num).toInt(),
  issues: (json['issues'] as List<dynamic>)
      .map((e) => StaffSentryIssueDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  url: json['url'] as String?,
  error: json['error'] as String?,
  computedAt: DateTime.parse(json['computedAt'] as String),
);

Map<String, dynamic> _$StaffSentrySummaryDtoToJson(
  StaffSentrySummaryDto instance,
) => <String, dynamic>{
  'state': instance.state.toJson(),
  'unresolved': instance.unresolved,
  'unresolvedAtLeast': instance.unresolvedAtLeast,
  'newCount': instance.newCount,
  'issues': instance.issues.map((e) => e.toJson()).toList(),
  'url': ?instance.url,
  'error': ?instance.error,
  'computedAt': instance.computedAt.toIso8601String(),
};
