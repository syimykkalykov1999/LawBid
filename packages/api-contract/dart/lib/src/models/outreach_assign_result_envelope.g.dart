// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_assign_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachAssignResultEnvelope _$OutreachAssignResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => OutreachAssignResultEnvelope(
  data: OutreachAssignResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OutreachAssignResultEnvelopeToJson(
  OutreachAssignResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
