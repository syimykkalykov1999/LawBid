// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sign_verify_dto.g.dart';

@JsonSerializable()
class SignVerifyDto {
  const SignVerifyDto({
    required this.sourceOk,
    required this.finalOk,
    required this.journalOk,
    required this.journalSignatures,
    required this.sourceSha256,
    required this.finalSha256,
  });

  factory SignVerifyDto.fromJson(Map<String, Object?> json) =>
      _$SignVerifyDtoFromJson(json);

  /// The original file still has the recorded SHA-256.
  final bool sourceOk;

  /// The signed file still has the recorded SHA-256 (null: not finished).
  final bool? finalOk;

  /// The case journal hash chain is intact.
  final bool journalOk;

  /// Signatures in the request that the journal also records.
  final num journalSignatures;
  final String sourceSha256;
  final String? finalSha256;

  Map<String, Object?> toJson() => _$SignVerifyDtoToJson(this);
}
