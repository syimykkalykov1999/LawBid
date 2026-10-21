// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stars_balance_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarsBalanceEnvelope _$StarsBalanceEnvelopeFromJson(
  Map<String, dynamic> json,
) => StarsBalanceEnvelope(
  data: StarsBalanceDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StarsBalanceEnvelopeToJson(
  StarsBalanceEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
