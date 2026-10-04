// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'submit_verification_request_dto.g.dart';

@JsonSerializable()
class SubmitVerificationRequestDto {
  const SubmitVerificationRequestDto({this.attestation, this.applicantComment});

  factory SubmitVerificationRequestDto.fromJson(Map<String, Object?> json) =>
      _$SubmitVerificationRequestDtoFromJson(json);

  /// Owner 2026-10-04: the attorney confirms under penalty of perjury that they hold the entered licenses (sworn statement, version ATTESTATION_VERSION). Required for a new submission.
  final bool? attestation;
  final String? applicantComment;

  Map<String, Object?> toJson() => _$SubmitVerificationRequestDtoToJson(this);
}
