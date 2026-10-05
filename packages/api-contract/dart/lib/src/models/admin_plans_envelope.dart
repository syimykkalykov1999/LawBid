// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_plans_dto.dart';
import 'response_meta_dto.dart';

part 'admin_plans_envelope.g.dart';

@JsonSerializable()
class AdminPlansEnvelope {
  const AdminPlansEnvelope({required this.data, this.meta});

  factory AdminPlansEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminPlansEnvelopeFromJson(json);

  final AdminPlansDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminPlansEnvelopeToJson(this);
}
