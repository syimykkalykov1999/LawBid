// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_billing_subscription_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminBillingSubscriptionRowListEnvelope
_$AdminBillingSubscriptionRowListEnvelopeFromJson(Map<String, dynamic> json) =>
    AdminBillingSubscriptionRowListEnvelope(
      data: (json['data'] as List<dynamic>)
          .map(
            (e) => AdminBillingSubscriptionRowDto.fromJson(
              e as Map<String, dynamic>,
            ),
          )
          .toList(),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AdminBillingSubscriptionRowListEnvelopeToJson(
  AdminBillingSubscriptionRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
