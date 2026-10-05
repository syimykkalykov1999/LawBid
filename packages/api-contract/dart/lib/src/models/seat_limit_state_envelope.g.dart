// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'seat_limit_state_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SeatLimitStateEnvelope _$SeatLimitStateEnvelopeFromJson(
  Map<String, dynamic> json,
) => SeatLimitStateEnvelope(
  data: SeatLimitStateDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SeatLimitStateEnvelopeToJson(
  SeatLimitStateEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
