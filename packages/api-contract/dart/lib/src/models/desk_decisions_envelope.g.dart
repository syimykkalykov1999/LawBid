// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'desk_decisions_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeskDecisionsEnvelope _$DeskDecisionsEnvelopeFromJson(
  Map<String, dynamic> json,
) => DeskDecisionsEnvelope(
  data: DeskDecisionsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DeskDecisionsEnvelopeToJson(
  DeskDecisionsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
