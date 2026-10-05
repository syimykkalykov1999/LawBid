// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payroll_accrual_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayrollAccrualEnvelope _$PayrollAccrualEnvelopeFromJson(
  Map<String, dynamic> json,
) => PayrollAccrualEnvelope(
  data: PayrollAccrualDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PayrollAccrualEnvelopeToJson(
  PayrollAccrualEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
