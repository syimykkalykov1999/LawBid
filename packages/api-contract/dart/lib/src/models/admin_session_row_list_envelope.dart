// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_session_row_dto.dart';
import 'response_meta_dto.dart';

part 'admin_session_row_list_envelope.g.dart';

@JsonSerializable()
class AdminSessionRowListEnvelope {
  const AdminSessionRowListEnvelope({required this.data, this.meta});

  factory AdminSessionRowListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminSessionRowListEnvelopeFromJson(json);

  final List<AdminSessionRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminSessionRowListEnvelopeToJson(this);
}
