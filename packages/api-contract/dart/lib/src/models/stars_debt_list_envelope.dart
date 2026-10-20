// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'stars_debt_dto.dart';

part 'stars_debt_list_envelope.g.dart';

@JsonSerializable()
class StarsDebtListEnvelope {
  const StarsDebtListEnvelope({required this.data, this.meta});

  factory StarsDebtListEnvelope.fromJson(Map<String, Object?> json) =>
      _$StarsDebtListEnvelopeFromJson(json);

  final List<StarsDebtDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StarsDebtListEnvelopeToJson(this);
}
