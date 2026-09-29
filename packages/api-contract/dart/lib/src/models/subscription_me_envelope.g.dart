// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'subscription_me_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SubscriptionMeEnvelope _$SubscriptionMeEnvelopeFromJson(
  Map<String, dynamic> json,
) => SubscriptionMeEnvelope(
  data: SubscriptionMeDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SubscriptionMeEnvelopeToJson(
  SubscriptionMeEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
