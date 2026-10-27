// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reporter_row_dto.dart';
import 'response_meta_dto.dart';

part 'reporter_row_list_envelope.g.dart';

@JsonSerializable()
class ReporterRowListEnvelope {
  const ReporterRowListEnvelope({required this.data, this.meta});

  factory ReporterRowListEnvelope.fromJson(Map<String, Object?> json) =>
      _$ReporterRowListEnvelopeFromJson(json);

  final List<ReporterRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ReporterRowListEnvelopeToJson(this);
}
