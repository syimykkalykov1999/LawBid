// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_subscription_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelSubscriptionEnvelope _$ChannelSubscriptionEnvelopeFromJson(
  Map<String, dynamic> json,
) => ChannelSubscriptionEnvelope(
  data: ChannelSubscriptionDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ChannelSubscriptionEnvelopeToJson(
  ChannelSubscriptionEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
