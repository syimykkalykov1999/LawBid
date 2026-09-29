// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'start_subscription_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StartSubscriptionResultEnvelope _$StartSubscriptionResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => StartSubscriptionResultEnvelope(
  data: StartSubscriptionResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StartSubscriptionResultEnvelopeToJson(
  StartSubscriptionResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
