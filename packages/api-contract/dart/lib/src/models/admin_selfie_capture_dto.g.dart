// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_selfie_capture_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSelfieCaptureDto _$AdminSelfieCaptureDtoFromJson(
  Map<String, dynamic> json,
) => AdminSelfieCaptureDto(
  source: AdminSelfieCaptureDtoSource.fromJson(json['source'] as String),
  tokenVerified: json['tokenVerified'] as bool,
  liveness: AdminSelfieCaptureDtoLiveness.fromJson(json['liveness'] as String),
  challenge: json['challenge'] == null
      ? null
      : AdminSelfieCaptureDtoChallenge.fromJson(json['challenge'] as String),
  fallbackReason: json['fallbackReason'] == null
      ? null
      : AdminSelfieCaptureDtoFallbackReason.fromJson(
          json['fallbackReason'] as String,
        ),
  faceDetected: json['faceDetected'] as bool,
  cardDetected: json['cardDetected'] as bool,
  framesCaptured: (json['framesCaptured'] as num?)?.toInt(),
  startedAt: json['startedAt'] == null
      ? null
      : DateTime.parse(json['startedAt'] as String),
  capturedAt: json['capturedAt'] == null
      ? null
      : DateTime.parse(json['capturedAt'] as String),
  platform: json['platform'] as String?,
  deviceModel: json['deviceModel'] as String?,
);

Map<String, dynamic> _$AdminSelfieCaptureDtoToJson(
  AdminSelfieCaptureDto instance,
) => <String, dynamic>{
  'source': instance.source.toJson(),
  'tokenVerified': instance.tokenVerified,
  'liveness': instance.liveness.toJson(),
  'challenge': ?instance.challenge?.toJson(),
  'fallbackReason': ?instance.fallbackReason?.toJson(),
  'faceDetected': instance.faceDetected,
  'cardDetected': instance.cardDetected,
  'framesCaptured': ?instance.framesCaptured,
  'startedAt': ?instance.startedAt?.toIso8601String(),
  'capturedAt': ?instance.capturedAt?.toIso8601String(),
  'platform': ?instance.platform,
  'deviceModel': ?instance.deviceModel,
};
