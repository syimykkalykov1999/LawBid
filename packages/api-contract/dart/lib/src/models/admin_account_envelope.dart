// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_account_dto.dart';
import 'response_meta_dto.dart';

part 'admin_account_envelope.g.dart';

@JsonSerializable()
class AdminAccountEnvelope {
  const AdminAccountEnvelope({required this.data, this.meta});

  factory AdminAccountEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminAccountEnvelopeFromJson(json);

  final AdminAccountDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminAccountEnvelopeToJson(this);
}
