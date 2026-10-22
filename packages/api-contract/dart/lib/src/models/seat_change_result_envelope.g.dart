// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'seat_change_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SeatChangeResultEnvelope _$SeatChangeResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => SeatChangeResultEnvelope(
  data: SeatChangeResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SeatChangeResultEnvelopeToJson(
  SeatChangeResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
