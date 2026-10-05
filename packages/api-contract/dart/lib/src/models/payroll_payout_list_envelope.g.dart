// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payroll_payout_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayrollPayoutListEnvelope _$PayrollPayoutListEnvelopeFromJson(
  Map<String, dynamic> json,
) => PayrollPayoutListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => PayrollPayoutDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PayrollPayoutListEnvelopeToJson(
  PayrollPayoutListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
