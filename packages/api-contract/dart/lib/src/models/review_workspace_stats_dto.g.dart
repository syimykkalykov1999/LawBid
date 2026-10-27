// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_workspace_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewWorkspaceStatsDto _$ReviewWorkspaceStatsDtoFromJson(
  Map<String, dynamic> json,
) => ReviewWorkspaceStatsDto(
  workspace: StaffReviewWorkspace.fromJson(json['workspace'] as String),
  decisions: json['decisions'] as num,
  sampled: json['sampled'] as num,
  overturned: json['overturned'] as num,
  overturnRate: json['overturnRate'] as num?,
  returnedRate: json['returnedRate'] as num?,
  goldenTotal: json['goldenTotal'] as num,
  goldenFailed: json['goldenFailed'] as num,
  pending: json['pending'] as num,
);

Map<String, dynamic> _$ReviewWorkspaceStatsDtoToJson(
  ReviewWorkspaceStatsDto instance,
) => <String, dynamic>{
  'workspace': instance.workspace.toJson(),
  'decisions': instance.decisions,
  'sampled': instance.sampled,
  'overturned': instance.overturned,
  'overturnRate': ?instance.overturnRate,
  'returnedRate': ?instance.returnedRate,
  'goldenTotal': instance.goldenTotal,
  'goldenFailed': instance.goldenFailed,
  'pending': instance.pending,
};
