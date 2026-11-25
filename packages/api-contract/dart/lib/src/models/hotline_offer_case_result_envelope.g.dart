// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_offer_case_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineOfferCaseResultEnvelope _$HotlineOfferCaseResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => HotlineOfferCaseResultEnvelope(
  data: HotlineOfferCaseResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$HotlineOfferCaseResultEnvelopeToJson(
  HotlineOfferCaseResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
