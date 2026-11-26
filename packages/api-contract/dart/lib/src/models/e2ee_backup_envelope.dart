// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'e2ee_backup_dto.dart';
import 'response_meta_dto.dart';

part 'e2ee_backup_envelope.g.dart';

@JsonSerializable()
class E2eeBackupEnvelope {
  const E2eeBackupEnvelope({required this.data, this.meta});

  factory E2eeBackupEnvelope.fromJson(Map<String, Object?> json) =>
      _$E2eeBackupEnvelopeFromJson(json);

  final E2eeBackupDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$E2eeBackupEnvelopeToJson(this);
}
