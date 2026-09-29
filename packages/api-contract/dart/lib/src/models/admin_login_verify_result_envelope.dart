// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_login_verify_result_dto.dart';
import 'response_meta_dto.dart';

part 'admin_login_verify_result_envelope.g.dart';

@JsonSerializable()
class AdminLoginVerifyResultEnvelope {
  const AdminLoginVerifyResultEnvelope({required this.data, this.meta});

  factory AdminLoginVerifyResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminLoginVerifyResultEnvelopeFromJson(json);

  final AdminLoginVerifyResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminLoginVerifyResultEnvelopeToJson(this);
}
