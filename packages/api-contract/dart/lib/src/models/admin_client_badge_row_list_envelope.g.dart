// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_client_badge_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminClientBadgeRowListEnvelope _$AdminClientBadgeRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminClientBadgeRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminClientBadgeRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminClientBadgeRowListEnvelopeToJson(
  AdminClientBadgeRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
