// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_account_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminAccountListEnvelope _$AdminAccountListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminAccountListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminAccountDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminAccountListEnvelopeToJson(
  AdminAccountListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
