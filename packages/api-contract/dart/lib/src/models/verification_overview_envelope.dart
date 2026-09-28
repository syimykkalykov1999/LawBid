// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'verification_overview_dto.dart';

part 'verification_overview_envelope.g.dart';

@JsonSerializable()
class VerificationOverviewEnvelope {
  const VerificationOverviewEnvelope({required this.data, this.meta});

  factory VerificationOverviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$VerificationOverviewEnvelopeFromJson(json);

  final VerificationOverviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$VerificationOverviewEnvelopeToJson(this);
}
