// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_counts_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCountsEnvelope _$AdminCountsEnvelopeFromJson(Map<String, dynamic> json) =>
    AdminCountsEnvelope(
      data: AdminCountsDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AdminCountsEnvelopeToJson(
  AdminCountsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
