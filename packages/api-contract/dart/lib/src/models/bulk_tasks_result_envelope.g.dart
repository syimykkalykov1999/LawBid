// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bulk_tasks_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BulkTasksResultEnvelope _$BulkTasksResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => BulkTasksResultEnvelope(
  data: BulkTasksResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$BulkTasksResultEnvelopeToJson(
  BulkTasksResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
