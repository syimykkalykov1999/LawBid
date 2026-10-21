// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'deadline_result_dto.dart';
import 'response_meta_dto.dart';

part 'deadline_result_envelope.g.dart';

@JsonSerializable()
class DeadlineResultEnvelope {
  const DeadlineResultEnvelope({required this.data, this.meta});

  factory DeadlineResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$DeadlineResultEnvelopeFromJson(json);

  final DeadlineResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DeadlineResultEnvelopeToJson(this);
}
