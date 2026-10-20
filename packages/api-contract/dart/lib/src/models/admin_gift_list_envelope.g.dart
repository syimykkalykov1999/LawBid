// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_gift_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminGiftListEnvelope _$AdminGiftListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminGiftListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminGiftDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminGiftListEnvelopeToJson(
  AdminGiftListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
