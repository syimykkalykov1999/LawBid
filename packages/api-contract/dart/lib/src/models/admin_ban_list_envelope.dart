// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_ban_dto.dart';
import 'response_meta_dto.dart';

part 'admin_ban_list_envelope.g.dart';

@JsonSerializable()
class AdminBanListEnvelope {
  const AdminBanListEnvelope({required this.data, this.meta});

  factory AdminBanListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminBanListEnvelopeFromJson(json);

  final List<AdminBanDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminBanListEnvelopeToJson(this);
}
