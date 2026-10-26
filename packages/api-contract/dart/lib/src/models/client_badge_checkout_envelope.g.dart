// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_badge_checkout_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientBadgeCheckoutEnvelope _$ClientBadgeCheckoutEnvelopeFromJson(
  Map<String, dynamic> json,
) => ClientBadgeCheckoutEnvelope(
  data: ClientBadgeCheckoutDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ClientBadgeCheckoutEnvelopeToJson(
  ClientBadgeCheckoutEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
