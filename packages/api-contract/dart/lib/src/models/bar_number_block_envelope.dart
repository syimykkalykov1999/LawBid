// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bar_number_block_dto.dart';
import 'response_meta_dto.dart';

part 'bar_number_block_envelope.g.dart';

@JsonSerializable()
class BarNumberBlockEnvelope {
  const BarNumberBlockEnvelope({required this.data, this.meta});

  factory BarNumberBlockEnvelope.fromJson(Map<String, Object?> json) =>
      _$BarNumberBlockEnvelopeFromJson(json);

  final BarNumberBlockDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BarNumberBlockEnvelopeToJson(this);
}
