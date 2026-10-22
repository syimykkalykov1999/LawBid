// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'seat_preview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SeatPreviewEnvelope _$SeatPreviewEnvelopeFromJson(Map<String, dynamic> json) =>
    SeatPreviewEnvelope(
      data: SeatPreviewDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$SeatPreviewEnvelopeToJson(
  SeatPreviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
