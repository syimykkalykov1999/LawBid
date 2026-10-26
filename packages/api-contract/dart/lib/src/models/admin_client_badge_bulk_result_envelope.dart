// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_client_badge_bulk_result_dto.dart';
import 'response_meta_dto.dart';

part 'admin_client_badge_bulk_result_envelope.g.dart';

@JsonSerializable()
class AdminClientBadgeBulkResultEnvelope {
  const AdminClientBadgeBulkResultEnvelope({required this.data, this.meta});

  factory AdminClientBadgeBulkResultEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AdminClientBadgeBulkResultEnvelopeFromJson(json);

  final AdminClientBadgeBulkResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminClientBadgeBulkResultEnvelopeToJson(this);
}
