// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'attorney_verification_status_dto.dart';
import 'response_meta_dto.dart';

part 'attorney_verification_status_envelope.g.dart';

@JsonSerializable()
class AttorneyVerificationStatusEnvelope {
  const AttorneyVerificationStatusEnvelope({required this.data, this.meta});

  factory AttorneyVerificationStatusEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AttorneyVerificationStatusEnvelopeFromJson(json);

  final AttorneyVerificationStatusDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AttorneyVerificationStatusEnvelopeToJson(this);
}
