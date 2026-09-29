// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'dashboard_dto.dart';
import 'response_meta_dto.dart';

part 'dashboard_envelope.g.dart';

@JsonSerializable()
class DashboardEnvelope {
  const DashboardEnvelope({required this.data, this.meta});

  factory DashboardEnvelope.fromJson(Map<String, Object?> json) =>
      _$DashboardEnvelopeFromJson(json);

  final DashboardDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DashboardEnvelopeToJson(this);
}
