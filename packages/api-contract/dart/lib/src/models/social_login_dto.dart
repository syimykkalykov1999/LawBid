// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'age_attestation_dto.dart';
import 'device_info_dto.dart';
import 'social_login_dto_provider.dart';

part 'social_login_dto.g.dart';

@JsonSerializable()
class SocialLoginDto {
  const SocialLoginDto({
    required this.provider,
    required this.idToken,
    required this.nonce,
    this.firstName,
    this.lastName,
    this.deviceInfo,
    this.ageAttestation,
  });

  factory SocialLoginDto.fromJson(Map<String, Object?> json) =>
      _$SocialLoginDtoFromJson(json);

  final SocialLoginDtoProvider provider;
  final String idToken;
  final String nonce;
  final String? firstName;
  final String? lastName;
  final DeviceInfoDto? deviceInfo;

  /// 2026-10-25 (COPPA): "I am 18 or older", for a NEW account only.
  final AgeAttestationDto? ageAttestation;

  Map<String, Object?> toJson() => _$SocialLoginDtoToJson(this);
}
