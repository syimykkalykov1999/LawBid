// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payout_account_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayoutAccountEnvelope _$PayoutAccountEnvelopeFromJson(
  Map<String, dynamic> json,
) => PayoutAccountEnvelope(
  data: PayoutAccountDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PayoutAccountEnvelopeToJson(
  PayoutAccountEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
