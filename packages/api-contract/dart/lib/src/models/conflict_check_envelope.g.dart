// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conflict_check_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConflictCheckEnvelope _$ConflictCheckEnvelopeFromJson(
  Map<String, dynamic> json,
) => ConflictCheckEnvelope(
  data: ConflictCheckDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ConflictCheckEnvelopeToJson(
  ConflictCheckEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
