// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ledger_overview_dto.dart';
import 'response_meta_dto.dart';

part 'ledger_overview_envelope.g.dart';

@JsonSerializable()
class LedgerOverviewEnvelope {
  const LedgerOverviewEnvelope({required this.data, this.meta});

  factory LedgerOverviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$LedgerOverviewEnvelopeFromJson(json);

  final LedgerOverviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$LedgerOverviewEnvelopeToJson(this);
}
