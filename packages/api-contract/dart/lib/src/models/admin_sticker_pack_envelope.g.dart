// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_sticker_pack_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminStickerPackEnvelope _$AdminStickerPackEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminStickerPackEnvelope(
  data: AdminStickerPackDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminStickerPackEnvelopeToJson(
  AdminStickerPackEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
