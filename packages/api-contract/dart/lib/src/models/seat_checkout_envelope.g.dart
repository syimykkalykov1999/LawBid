// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'seat_checkout_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SeatCheckoutEnvelope _$SeatCheckoutEnvelopeFromJson(
  Map<String, dynamic> json,
) => SeatCheckoutEnvelope(
  data: SeatCheckoutDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SeatCheckoutEnvelopeToJson(
  SeatCheckoutEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
