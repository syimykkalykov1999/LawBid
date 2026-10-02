// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_video_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminVideoRowListEnvelope _$AdminVideoRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminVideoRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminVideoRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminVideoRowListEnvelopeToJson(
  AdminVideoRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
