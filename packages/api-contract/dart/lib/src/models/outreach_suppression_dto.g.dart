// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_suppression_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachSuppressionDto _$OutreachSuppressionDtoFromJson(
  Map<String, dynamic> json,
) => OutreachSuppressionDto(
  kind: OutreachSuppressionKind.fromJson(json['kind'] as String),
  value: json['value'] as String,
  note: json['note'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$OutreachSuppressionDtoToJson(
  OutreachSuppressionDto instance,
) => <String, dynamic>{
  'kind': instance.kind.toJson(),
  'value': instance.value,
  'note': ?instance.note,
  'createdAt': instance.createdAt.toIso8601String(),
};
