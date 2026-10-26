// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_sticker_pack_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminStickerPackRowListEnvelope _$AdminStickerPackRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminStickerPackRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminStickerPackRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminStickerPackRowListEnvelopeToJson(
  AdminStickerPackRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
