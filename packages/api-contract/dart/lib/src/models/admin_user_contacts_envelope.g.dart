// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_user_contacts_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUserContactsEnvelope _$AdminUserContactsEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminUserContactsEnvelope(
  data: AdminUserContactsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminUserContactsEnvelopeToJson(
  AdminUserContactsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
