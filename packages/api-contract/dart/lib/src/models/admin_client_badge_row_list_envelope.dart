// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_client_badge_row_dto.dart';
import 'response_meta_dto.dart';

part 'admin_client_badge_row_list_envelope.g.dart';

@JsonSerializable()
class AdminClientBadgeRowListEnvelope {
  const AdminClientBadgeRowListEnvelope({required this.data, this.meta});

  factory AdminClientBadgeRowListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminClientBadgeRowListEnvelopeFromJson(json);

  final List<AdminClientBadgeRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminClientBadgeRowListEnvelopeToJson(this);
}
