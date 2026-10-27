// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'piecework_overview_dto.dart';
import 'response_meta_dto.dart';

part 'piecework_overview_envelope.g.dart';

@JsonSerializable()
class PieceworkOverviewEnvelope {
  const PieceworkOverviewEnvelope({required this.data, this.meta});

  factory PieceworkOverviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$PieceworkOverviewEnvelopeFromJson(json);

  final PieceworkOverviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PieceworkOverviewEnvelopeToJson(this);
}
