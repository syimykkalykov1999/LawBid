// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'new_entitlement_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NewEntitlementResultEnvelope _$NewEntitlementResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => NewEntitlementResultEnvelope(
  data: NewEntitlementResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$NewEntitlementResultEnvelopeToJson(
  NewEntitlementResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
