// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_subscription_action_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSubscriptionActionResultEnvelope
_$AdminSubscriptionActionResultEnvelopeFromJson(Map<String, dynamic> json) =>
    AdminSubscriptionActionResultEnvelope(
      data: AdminSubscriptionActionResultDto.fromJson(
        json['data'] as Map<String, dynamic>,
      ),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AdminSubscriptionActionResultEnvelopeToJson(
  AdminSubscriptionActionResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
