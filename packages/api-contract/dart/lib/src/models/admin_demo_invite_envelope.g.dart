// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_demo_invite_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDemoInviteEnvelope _$AdminDemoInviteEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminDemoInviteEnvelope(
  data: AdminDemoInviteDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminDemoInviteEnvelopeToJson(
  AdminDemoInviteEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
