// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'identity_check_link_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IdentityCheckLinkEnvelope _$IdentityCheckLinkEnvelopeFromJson(
  Map<String, dynamic> json,
) => IdentityCheckLinkEnvelope(
  data: IdentityCheckLinkDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$IdentityCheckLinkEnvelopeToJson(
  IdentityCheckLinkEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
