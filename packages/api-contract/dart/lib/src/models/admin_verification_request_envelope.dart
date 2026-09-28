// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_verification_request_dto.dart';
import 'response_meta_dto.dart';

part 'admin_verification_request_envelope.g.dart';

@JsonSerializable()
class AdminVerificationRequestEnvelope {
  const AdminVerificationRequestEnvelope({required this.data, this.meta});

  factory AdminVerificationRequestEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AdminVerificationRequestEnvelopeFromJson(json);

  final AdminVerificationRequestDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminVerificationRequestEnvelopeToJson(this);
}
