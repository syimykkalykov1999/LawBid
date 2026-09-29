// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_session_dto.dart';
import 'response_meta_dto.dart';

part 'admin_session_envelope.g.dart';

@JsonSerializable()
class AdminSessionEnvelope {
  const AdminSessionEnvelope({required this.data, this.meta});

  factory AdminSessionEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminSessionEnvelopeFromJson(json);

  final AdminSessionDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminSessionEnvelopeToJson(this);
}
