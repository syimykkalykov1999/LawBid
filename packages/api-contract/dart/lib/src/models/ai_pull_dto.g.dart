// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_pull_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiPullDto _$AiPullDtoFromJson(Map<String, dynamic> json) => AiPullDto(
  number: json['number'] as num,
  title: json['title'] as String,
  url: json['url'] as String,
  summary: json['summary'] as String,
  headSha: json['headSha'] as String,
  branch: json['branch'] as String,
  createdAt: DateTime.parse(json['createdAt'] as String),
  checks: AiPullDtoChecks.fromJson(json['checks'] as String),
  costUsd: json['costUsd'] as num?,
);

Map<String, dynamic> _$AiPullDtoToJson(AiPullDto instance) => <String, dynamic>{
  'number': instance.number,
  'title': instance.title,
  'url': instance.url,
  'summary': instance.summary,
  'headSha': instance.headSha,
  'branch': instance.branch,
  'createdAt': instance.createdAt.toIso8601String(),
  'checks': instance.checks.toJson(),
  'costUsd': ?instance.costUsd,
};
