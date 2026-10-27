// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deletion_cancelled_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeletionCancelledEnvelope _$DeletionCancelledEnvelopeFromJson(
  Map<String, dynamic> json,
) => DeletionCancelledEnvelope(
  data: DeletionCancelledDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DeletionCancelledEnvelopeToJson(
  DeletionCancelledEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
