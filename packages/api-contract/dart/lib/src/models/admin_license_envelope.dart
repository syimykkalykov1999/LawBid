// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_license_dto.dart';
import 'response_meta_dto.dart';

part 'admin_license_envelope.g.dart';

@JsonSerializable()
class AdminLicenseEnvelope {
  const AdminLicenseEnvelope({required this.data, this.meta});

  factory AdminLicenseEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminLicenseEnvelopeFromJson(json);

  final AdminLicenseDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminLicenseEnvelopeToJson(this);
}
