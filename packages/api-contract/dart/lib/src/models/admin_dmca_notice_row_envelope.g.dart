// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_dmca_notice_row_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDmcaNoticeRowEnvelope _$AdminDmcaNoticeRowEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminDmcaNoticeRowEnvelope(
  data: AdminDmcaNoticeRowDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminDmcaNoticeRowEnvelopeToJson(
  AdminDmcaNoticeRowEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
