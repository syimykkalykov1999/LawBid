// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'seat_limit_request_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SeatLimitRequestEnvelope _$SeatLimitRequestEnvelopeFromJson(
  Map<String, dynamic> json,
) => SeatLimitRequestEnvelope(
  data: SeatLimitRequestDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SeatLimitRequestEnvelopeToJson(
  SeatLimitRequestEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
