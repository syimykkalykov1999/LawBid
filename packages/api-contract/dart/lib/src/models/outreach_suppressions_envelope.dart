// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_suppressions_dto.dart';
import 'response_meta_dto.dart';

part 'outreach_suppressions_envelope.g.dart';

@JsonSerializable()
class OutreachSuppressionsEnvelope {
  const OutreachSuppressionsEnvelope({required this.data, this.meta});

  factory OutreachSuppressionsEnvelope.fromJson(Map<String, Object?> json) =>
      _$OutreachSuppressionsEnvelopeFromJson(json);

  final OutreachSuppressionsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$OutreachSuppressionsEnvelopeToJson(this);
}
