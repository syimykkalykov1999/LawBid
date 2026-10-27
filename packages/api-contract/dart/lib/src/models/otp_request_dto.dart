// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'otp_request_dto_channel.dart';
import 'otp_request_dto_purpose.dart';

part 'otp_request_dto.g.dart';

@JsonSerializable()
class OtpRequestDto {
  const OtpRequestDto({
    required this.channel,
    required this.identifier,
    this.linkChallenge,
    this.purpose,
  });

  factory OtpRequestDto.fromJson(Map<String, Object?> json) =>
      _$OtpRequestDtoFromJson(json);

  final OtpRequestDtoChannel channel;
  final String identifier;

  /// Magic-link binding (email login only): base64url SHA-256 of a random.
  /// verifier that stays on the requesting device. The emailed link then.
  /// carries a one-time token redeemable only together with that verifier.
  /// (POST /auth/otp/verify-link), so a leaked link is useless. Omit it and.
  /// the email contains the code only.
  final String? linkChallenge;

  /// What the code is for. Omit it for a sign-in / sign-up code. `reauth`.
  /// (a step-up before a sensitive change) and `link` (adding a sign-in.
  /// method) need the caller's bearer token: the code is then good only for.
  /// that flow and that session (POST /auth/reauth, POST /auth/identifiers).
  final OtpRequestDtoPurpose? purpose;

  Map<String, Object?> toJson() => _$OtpRequestDtoToJson(this);
}
