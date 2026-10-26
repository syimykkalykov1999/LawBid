// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_no_show_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminNoShowEnvelope _$AdminNoShowEnvelopeFromJson(Map<String, dynamic> json) =>
    AdminNoShowEnvelope(
      data: AdminNoShowDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AdminNoShowEnvelopeToJson(
  AdminNoShowEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
