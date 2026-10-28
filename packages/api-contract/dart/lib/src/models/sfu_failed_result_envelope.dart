// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'sfu_failed_result_dto.dart';

part 'sfu_failed_result_envelope.g.dart';

@JsonSerializable()
class SfuFailedResultEnvelope {
  const SfuFailedResultEnvelope({required this.data, this.meta});

  factory SfuFailedResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$SfuFailedResultEnvelopeFromJson(json);

  final SfuFailedResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SfuFailedResultEnvelopeToJson(this);
}
