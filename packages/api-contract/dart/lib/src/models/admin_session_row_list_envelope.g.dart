// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_session_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSessionRowListEnvelope _$AdminSessionRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminSessionRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminSessionRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminSessionRowListEnvelopeToJson(
  AdminSessionRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
