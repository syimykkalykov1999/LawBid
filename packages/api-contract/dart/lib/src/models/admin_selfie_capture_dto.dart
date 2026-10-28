// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_selfie_capture_dto_challenge.dart';
import 'admin_selfie_capture_dto_fallback_reason.dart';
import 'admin_selfie_capture_dto_liveness.dart';
import 'admin_selfie_capture_dto_source.dart';

part 'admin_selfie_capture_dto.g.dart';

@JsonSerializable()
class AdminSelfieCaptureDto {
  const AdminSelfieCaptureDto({
    required this.source,
    required this.tokenVerified,
    required this.liveness,
    required this.challenge,
    required this.fallbackReason,
    required this.faceDetected,
    required this.cardDetected,
    required this.framesCaptured,
    required this.startedAt,
    required this.capturedAt,
    required this.platform,
    required this.deviceModel,
  });

  factory AdminSelfieCaptureDto.fromJson(Map<String, Object?> json) =>
      _$AdminSelfieCaptureDtoFromJson(json);

  /// unknown = no capture report (old app / switch off).
  final AdminSelfieCaptureDtoSource source;

  /// A valid one-time capture token was spent with this selfie.
  final bool tokenVerified;
  final AdminSelfieCaptureDtoLiveness liveness;
  final AdminSelfieCaptureDtoChallenge? challenge;
  final AdminSelfieCaptureDtoFallbackReason? fallbackReason;
  final bool faceDetected;
  final bool cardDetected;
  final int? framesCaptured;
  final DateTime? startedAt;
  final DateTime? capturedAt;
  final String? platform;
  final String? deviceModel;

  Map<String, Object?> toJson() => _$AdminSelfieCaptureDtoToJson(this);
}
