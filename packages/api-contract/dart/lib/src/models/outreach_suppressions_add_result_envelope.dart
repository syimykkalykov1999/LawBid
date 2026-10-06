// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_suppressions_add_result_dto.dart';
import 'response_meta_dto.dart';

part 'outreach_suppressions_add_result_envelope.g.dart';

@JsonSerializable()
class OutreachSuppressionsAddResultEnvelope {
  const OutreachSuppressionsAddResultEnvelope({required this.data, this.meta});

  factory OutreachSuppressionsAddResultEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$OutreachSuppressionsAddResultEnvelopeFromJson(json);

  final OutreachSuppressionsAddResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$OutreachSuppressionsAddResultEnvelopeToJson(this);
}
