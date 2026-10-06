// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_dmca_notice_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDmcaNoticeRowListEnvelope _$AdminDmcaNoticeRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminDmcaNoticeRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminDmcaNoticeRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminDmcaNoticeRowListEnvelopeToJson(
  AdminDmcaNoticeRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
