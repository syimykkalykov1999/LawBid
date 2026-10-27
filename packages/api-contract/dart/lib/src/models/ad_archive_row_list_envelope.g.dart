// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ad_archive_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdArchiveRowListEnvelope _$AdArchiveRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdArchiveRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdArchiveRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdArchiveRowListEnvelopeToJson(
  AdArchiveRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
