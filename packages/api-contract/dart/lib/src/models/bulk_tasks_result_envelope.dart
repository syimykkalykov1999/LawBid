// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bulk_tasks_result_dto.dart';
import 'response_meta_dto.dart';

part 'bulk_tasks_result_envelope.g.dart';

@JsonSerializable()
class BulkTasksResultEnvelope {
  const BulkTasksResultEnvelope({required this.data, this.meta});

  factory BulkTasksResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$BulkTasksResultEnvelopeFromJson(json);

  final BulkTasksResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BulkTasksResultEnvelopeToJson(this);
}
