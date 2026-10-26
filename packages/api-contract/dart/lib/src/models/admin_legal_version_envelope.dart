// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_legal_version_dto.dart';
import 'response_meta_dto.dart';

part 'admin_legal_version_envelope.g.dart';

@JsonSerializable()
class AdminLegalVersionEnvelope {
  const AdminLegalVersionEnvelope({required this.data, this.meta});

  factory AdminLegalVersionEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminLegalVersionEnvelopeFromJson(json);

  final AdminLegalVersionDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminLegalVersionEnvelopeToJson(this);
}
