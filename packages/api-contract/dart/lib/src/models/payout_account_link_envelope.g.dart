// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payout_account_link_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayoutAccountLinkEnvelope _$PayoutAccountLinkEnvelopeFromJson(
  Map<String, dynamic> json,
) => PayoutAccountLinkEnvelope(
  data: PayoutAccountLinkDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PayoutAccountLinkEnvelopeToJson(
  PayoutAccountLinkEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
