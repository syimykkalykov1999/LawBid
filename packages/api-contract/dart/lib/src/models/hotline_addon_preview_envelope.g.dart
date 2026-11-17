// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_addon_preview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineAddonPreviewEnvelope _$HotlineAddonPreviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => HotlineAddonPreviewEnvelope(
  data: HotlineAddonPreviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$HotlineAddonPreviewEnvelopeToJson(
  HotlineAddonPreviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
