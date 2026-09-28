// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'license_recheck_dto.dart';
import 'response_meta_dto.dart';

part 'license_recheck_envelope.g.dart';

@JsonSerializable()
class LicenseRecheckEnvelope {
  const LicenseRecheckEnvelope({required this.data, this.meta});

  factory LicenseRecheckEnvelope.fromJson(Map<String, Object?> json) =>
      _$LicenseRecheckEnvelopeFromJson(json);

  final LicenseRecheckDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$LicenseRecheckEnvelopeToJson(this);
}
