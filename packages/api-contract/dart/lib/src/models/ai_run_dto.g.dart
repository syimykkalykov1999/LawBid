// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_run_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiRunDto _$AiRunDtoFromJson(Map<String, dynamic> json) => AiRunDto(
  at: DateTime.parse(json['at'] as String),
  kind: AiRunDtoKind.fromJson(json['kind'] as String),
  issueNumber: json['issueNumber'] as num?,
  runUrl: json['runUrl'] as String,
  costUsd: json['costUsd'] as num,
  conclusion: json['conclusion'] as String,
  prUrl: json['prUrl'] as String?,
);

Map<String, dynamic> _$AiRunDtoToJson(AiRunDto instance) => <String, dynamic>{
  'at': instance.at.toIso8601String(),
  'kind': instance.kind.toJson(),
  'issueNumber': ?instance.issueNumber,
  'runUrl': instance.runUrl,
  'costUsd': instance.costUsd,
  'conclusion': instance.conclusion,
  'prUrl': ?instance.prUrl,
};
