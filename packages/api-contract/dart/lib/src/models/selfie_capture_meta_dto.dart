// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'selfie_capture_meta_dto_challenge.dart';
import 'selfie_capture_meta_dto_fallback_reason.dart';
import 'selfie_capture_meta_dto_liveness.dart';
import 'selfie_capture_meta_dto_platform.dart';

part 'selfie_capture_meta_dto.g.dart';

@JsonSerializable()
class SelfieCaptureMetaDto {
  const SelfieCaptureMetaDto({
    required this.liveness,
    required this.faceDetected,
    required this.cardDetected,
    required this.framesCaptured,
    required this.startedAt,
    required this.capturedAt,
    required this.platform,
    this.challenge,
    this.fallbackReason,
    this.deviceModel,
  });

  factory SelfieCaptureMetaDto.fromJson(Map<String, Object?> json) =>
      _$SelfieCaptureMetaDtoFromJson(json);

  /// passed = the random on-device liveness prompt was done; not_checked = no face detector on this device (manual shot); skipped = the attorney used «Take photo anyway» after the timeout (still the live camera).
  final SelfieCaptureMetaDtoLiveness liveness;

  /// The random prompt shown (blink / turn the head).
  final SelfieCaptureMetaDtoChallenge? challenge;

  /// Why liveness was not passed, when it was not.
  final SelfieCaptureMetaDtoFallbackReason? fallbackReason;

  /// Exactly one face was found in the oval.
  final bool faceDetected;

  /// Text was found where the ID card is held (a soft hint; false = not auto-detected, the verifier checks the picture).
  final bool cardDetected;
  final int framesCaptured;

  /// Camera opened.
  final DateTime startedAt;

  /// Picture taken.
  final DateTime capturedAt;
  final SelfieCaptureMetaDtoPlatform platform;

  /// e.g. "iPhone15,2".
  final String? deviceModel;

  Map<String, Object?> toJson() => _$SelfieCaptureMetaDtoToJson(this);
}
