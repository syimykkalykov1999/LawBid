// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_line_view_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineLineViewEnvelope _$HotlineLineViewEnvelopeFromJson(
  Map<String, dynamic> json,
) => HotlineLineViewEnvelope(
  data: HotlineLineViewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$HotlineLineViewEnvelopeToJson(
  HotlineLineViewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
