// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_counts_dto.dart';
import 'response_meta_dto.dart';

part 'admin_counts_envelope.g.dart';

@JsonSerializable()
class AdminCountsEnvelope {
  const AdminCountsEnvelope({required this.data, this.meta});

  factory AdminCountsEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminCountsEnvelopeFromJson(json);

  final AdminCountsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminCountsEnvelopeToJson(this);
}
