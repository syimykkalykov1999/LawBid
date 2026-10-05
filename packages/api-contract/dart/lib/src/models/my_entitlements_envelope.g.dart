// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'my_entitlements_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MyEntitlementsEnvelope _$MyEntitlementsEnvelopeFromJson(
  Map<String, dynamic> json,
) => MyEntitlementsEnvelope(
  data: MyEntitlementsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MyEntitlementsEnvelopeToJson(
  MyEntitlementsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
