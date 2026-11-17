// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_offer_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineOfferResultEnvelope _$HotlineOfferResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => HotlineOfferResultEnvelope(
  data: HotlineOfferResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$HotlineOfferResultEnvelopeToJson(
  HotlineOfferResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
