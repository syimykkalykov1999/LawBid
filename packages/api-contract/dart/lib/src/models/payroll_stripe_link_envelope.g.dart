// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payroll_stripe_link_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayrollStripeLinkEnvelope _$PayrollStripeLinkEnvelopeFromJson(
  Map<String, dynamic> json,
) => PayrollStripeLinkEnvelope(
  data: PayrollStripeLinkDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PayrollStripeLinkEnvelopeToJson(
  PayrollStripeLinkEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
