// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'selfie_capture_meta_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SelfieCaptureMetaDto _$SelfieCaptureMetaDtoFromJson(
  Map<String, dynamic> json,
) => SelfieCaptureMetaDto(
  liveness: SelfieCaptureMetaDtoLiveness.fromJson(json['liveness'] as String),
  faceDetected: json['faceDetected'] as bool,
  cardDetected: json['cardDetected'] as bool,
  framesCaptured: (json['framesCaptured'] as num).toInt(),
  startedAt: DateTime.parse(json['startedAt'] as String),
  capturedAt: DateTime.parse(json['capturedAt'] as String),
  platform: SelfieCaptureMetaDtoPlatform.fromJson(json['platform'] as String),
  challenge: json['challenge'] == null
      ? null
      : SelfieCaptureMetaDtoChallenge.fromJson(json['challenge'] as String),
  fallbackReason: json['fallbackReason'] == null
      ? null
      : SelfieCaptureMetaDtoFallbackReason.fromJson(
          json['fallbackReason'] as String,
        ),
  deviceModel: json['deviceModel'] as String?,
);

Map<String, dynamic> _$SelfieCaptureMetaDtoToJson(
  SelfieCaptureMetaDto instance,
) => <String, dynamic>{
  'liveness': instance.liveness.toJson(),
  'challenge': ?instance.challenge?.toJson(),
  'fallbackReason': ?instance.fallbackReason?.toJson(),
  'faceDetected': instance.faceDetected,
  'cardDetected': instance.cardDetected,
  'framesCaptured': instance.framesCaptured,
  'startedAt': instance.startedAt.toIso8601String(),
  'capturedAt': instance.capturedAt.toIso8601String(),
  'platform': instance.platform.toJson(),
  'deviceModel': ?instance.deviceModel,
};
