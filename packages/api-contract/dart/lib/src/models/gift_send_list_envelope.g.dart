// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'gift_send_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GiftSendListEnvelope _$GiftSendListEnvelopeFromJson(
  Map<String, dynamic> json,
) => GiftSendListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => GiftSendDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$GiftSendListEnvelopeToJson(
  GiftSendListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
