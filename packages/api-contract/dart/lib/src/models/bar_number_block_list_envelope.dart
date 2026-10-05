// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bar_number_block_dto.dart';
import 'response_meta_dto.dart';

part 'bar_number_block_list_envelope.g.dart';

@JsonSerializable()
class BarNumberBlockListEnvelope {
  const BarNumberBlockListEnvelope({required this.data, this.meta});

  factory BarNumberBlockListEnvelope.fromJson(Map<String, Object?> json) =>
      _$BarNumberBlockListEnvelopeFromJson(json);

  final List<BarNumberBlockDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BarNumberBlockListEnvelopeToJson(this);
}
