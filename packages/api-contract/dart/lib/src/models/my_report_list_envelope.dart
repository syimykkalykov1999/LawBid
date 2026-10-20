// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'my_report_dto.dart';
import 'response_meta_dto.dart';

part 'my_report_list_envelope.g.dart';

@JsonSerializable()
class MyReportListEnvelope {
  const MyReportListEnvelope({required this.data, this.meta});

  factory MyReportListEnvelope.fromJson(Map<String, Object?> json) =>
      _$MyReportListEnvelopeFromJson(json);

  final List<MyReportDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MyReportListEnvelopeToJson(this);
}
