// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_demo_accounts_page_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDemoAccountsPageEnvelope _$AdminDemoAccountsPageEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminDemoAccountsPageEnvelope(
  data: AdminDemoAccountsPageDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminDemoAccountsPageEnvelopeToJson(
  AdminDemoAccountsPageEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
