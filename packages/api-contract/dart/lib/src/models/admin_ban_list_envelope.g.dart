// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_ban_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminBanListEnvelope _$AdminBanListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminBanListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminBanDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminBanListEnvelopeToJson(
  AdminBanListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
