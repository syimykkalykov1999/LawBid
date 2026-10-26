// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'file_view_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FileViewListEnvelope _$FileViewListEnvelopeFromJson(
  Map<String, dynamic> json,
) => FileViewListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => FileViewDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$FileViewListEnvelopeToJson(
  FileViewListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
