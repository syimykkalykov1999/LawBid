// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_logout_result_dto.dart';
import 'response_meta_dto.dart';

part 'admin_logout_result_envelope.g.dart';

@JsonSerializable()
class AdminLogoutResultEnvelope {
  const AdminLogoutResultEnvelope({required this.data, this.meta});

  factory AdminLogoutResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminLogoutResultEnvelopeFromJson(json);

  final AdminLogoutResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminLogoutResultEnvelopeToJson(this);
}
