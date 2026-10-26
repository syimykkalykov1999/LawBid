// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'qa_summary_dto.dart';
import 'response_meta_dto.dart';

part 'qa_summary_envelope.g.dart';

@JsonSerializable()
class QaSummaryEnvelope {
  const QaSummaryEnvelope({required this.data, this.meta});

  factory QaSummaryEnvelope.fromJson(Map<String, Object?> json) =>
      _$QaSummaryEnvelopeFromJson(json);

  final QaSummaryDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$QaSummaryEnvelopeToJson(this);
}
