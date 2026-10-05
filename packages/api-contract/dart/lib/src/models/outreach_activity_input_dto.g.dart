// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_activity_input_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachActivityInputDto _$OutreachActivityInputDtoFromJson(
  Map<String, dynamic> json,
) => OutreachActivityInputDto(
  kind: OutreachActivityInputKind.fromJson(json['kind'] as String),
  outcome: json['outcome'] == null
      ? null
      : OutreachCallOutcome.fromJson(json['outcome'] as String),
  body: json['body'] as String?,
  nextActionAt: json['nextActionAt'] == null
      ? null
      : DateTime.parse(json['nextActionAt'] as String),
);

Map<String, dynamic> _$OutreachActivityInputDtoToJson(
  OutreachActivityInputDto instance,
) => <String, dynamic>{
  'kind': instance.kind.toJson(),
  'outcome': ?instance.outcome?.toJson(),
  'body': ?instance.body,
  'nextActionAt': ?instance.nextActionAt?.toIso8601String(),
};
