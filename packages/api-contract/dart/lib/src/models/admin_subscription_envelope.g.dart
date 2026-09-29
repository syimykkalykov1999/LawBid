// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_subscription_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSubscriptionEnvelope _$AdminSubscriptionEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminSubscriptionEnvelope(
  data: AdminSubscriptionDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminSubscriptionEnvelopeToJson(
  AdminSubscriptionEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
