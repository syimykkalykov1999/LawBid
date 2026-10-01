// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_overview_dto.dart';
import 'response_meta_dto.dart';

part 'admin_overview_envelope.g.dart';

@JsonSerializable()
class AdminOverviewEnvelope {
  const AdminOverviewEnvelope({required this.data, this.meta});

  factory AdminOverviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminOverviewEnvelopeFromJson(json);

  final AdminOverviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminOverviewEnvelopeToJson(this);
}
