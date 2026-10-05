// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payroll_summary_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayrollSummaryEnvelope _$PayrollSummaryEnvelopeFromJson(
  Map<String, dynamic> json,
) => PayrollSummaryEnvelope(
  data: PayrollSummaryDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PayrollSummaryEnvelopeToJson(
  PayrollSummaryEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
