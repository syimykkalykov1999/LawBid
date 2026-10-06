// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_suppressions_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachSuppressionsEnvelope _$OutreachSuppressionsEnvelopeFromJson(
  Map<String, dynamic> json,
) => OutreachSuppressionsEnvelope(
  data: OutreachSuppressionsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OutreachSuppressionsEnvelopeToJson(
  OutreachSuppressionsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
