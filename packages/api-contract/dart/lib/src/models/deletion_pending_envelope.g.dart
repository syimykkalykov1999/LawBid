// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deletion_pending_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeletionPendingEnvelope _$DeletionPendingEnvelopeFromJson(
  Map<String, dynamic> json,
) => DeletionPendingEnvelope(
  data: DeletionPendingDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DeletionPendingEnvelopeToJson(
  DeletionPendingEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
