// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_post_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPostRowListEnvelope _$AdminPostRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminPostRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminPostRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminPostRowListEnvelopeToJson(
  AdminPostRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
