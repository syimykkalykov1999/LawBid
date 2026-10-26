// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_legal_version_dto.dart';
import 'response_meta_dto.dart';

part 'admin_legal_version_list_envelope.g.dart';

@JsonSerializable()
class AdminLegalVersionListEnvelope {
  const AdminLegalVersionListEnvelope({required this.data, this.meta});

  factory AdminLegalVersionListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminLegalVersionListEnvelopeFromJson(json);

  final List<AdminLegalVersionDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminLegalVersionListEnvelopeToJson(this);
}
