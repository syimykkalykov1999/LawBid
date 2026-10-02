// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_ok_dto.dart';
import 'response_meta_dto.dart';

part 'admin_ok_envelope.g.dart';

@JsonSerializable()
class AdminOkEnvelope {
  const AdminOkEnvelope({required this.data, this.meta});

  factory AdminOkEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminOkEnvelopeFromJson(json);

  final AdminOkDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminOkEnvelopeToJson(this);
}
