// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'backfill_run_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BackfillRunListEnvelope _$BackfillRunListEnvelopeFromJson(
  Map<String, dynamic> json,
) => BackfillRunListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => BackfillRunDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$BackfillRunListEnvelopeToJson(
  BackfillRunListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
