// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sanction_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SanctionResultEnvelope _$SanctionResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => SanctionResultEnvelope(
  data: SanctionResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SanctionResultEnvelopeToJson(
  SanctionResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
