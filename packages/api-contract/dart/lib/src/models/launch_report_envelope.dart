// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'launch_report_dto.dart';
import 'response_meta_dto.dart';

part 'launch_report_envelope.g.dart';

@JsonSerializable()
class LaunchReportEnvelope {
  const LaunchReportEnvelope({required this.data, this.meta});

  factory LaunchReportEnvelope.fromJson(Map<String, Object?> json) =>
      _$LaunchReportEnvelopeFromJson(json);

  final LaunchReportDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$LaunchReportEnvelopeToJson(this);
}
