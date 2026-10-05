// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payroll_payout_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayrollPayoutEnvelope _$PayrollPayoutEnvelopeFromJson(
  Map<String, dynamic> json,
) => PayrollPayoutEnvelope(
  data: PayrollPayoutDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PayrollPayoutEnvelopeToJson(
  PayrollPayoutEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
