// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_promotion_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPromotionRowListEnvelope _$AdminPromotionRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminPromotionRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminPromotionRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminPromotionRowListEnvelopeToJson(
  AdminPromotionRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
