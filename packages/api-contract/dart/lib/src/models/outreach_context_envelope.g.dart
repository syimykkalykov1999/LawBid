// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_context_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachContextEnvelope _$OutreachContextEnvelopeFromJson(
  Map<String, dynamic> json,
) => OutreachContextEnvelope(
  data: OutreachContextDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OutreachContextEnvelopeToJson(
  OutreachContextEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
