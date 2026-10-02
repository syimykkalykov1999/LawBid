// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_case_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCaseRowListEnvelope _$AdminCaseRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminCaseRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminCaseRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminCaseRowListEnvelopeToJson(
  AdminCaseRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
