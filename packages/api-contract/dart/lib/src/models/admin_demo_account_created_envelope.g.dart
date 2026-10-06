// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_demo_account_created_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDemoAccountCreatedEnvelope _$AdminDemoAccountCreatedEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminDemoAccountCreatedEnvelope(
  data: AdminDemoAccountCreatedDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminDemoAccountCreatedEnvelopeToJson(
  AdminDemoAccountCreatedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
