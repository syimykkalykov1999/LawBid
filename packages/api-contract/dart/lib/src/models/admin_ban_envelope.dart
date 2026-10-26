// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_ban_dto.dart';
import 'response_meta_dto.dart';

part 'admin_ban_envelope.g.dart';

@JsonSerializable()
class AdminBanEnvelope {
  const AdminBanEnvelope({required this.data, this.meta});

  factory AdminBanEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminBanEnvelopeFromJson(json);

  final AdminBanDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminBanEnvelopeToJson(this);
}
