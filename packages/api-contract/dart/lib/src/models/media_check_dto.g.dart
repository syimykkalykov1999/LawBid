// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'media_check_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MediaCheckDto _$MediaCheckDtoFromJson(Map<String, dynamic> json) =>
    MediaCheckDto(
      id: json['id'] as String,
      fileId: json['fileId'] as String?,
      videoAssetId: json['videoAssetId'] as String?,
      ownerUserId: json['ownerUserId'] as String,
      purpose: json['purpose'] as String,
      status: MediaCheckDtoStatus.fromJson(json['status'] as String),
      csamStatus: MediaCheckDtoCsamStatus.fromJson(
        json['csamStatus'] as String,
      ),
      provider: json['provider'] as String?,
      labels: (json['labels'] as List<dynamic>)
          .map((e) => MediaLabelDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      maxConfidence: json['maxConfidence'] as num?,
      topLabel: json['topLabel'] as String?,
      skipReason: json['skipReason'] as String?,
      hiddenTargets: (json['hiddenTargets'] as List<dynamic>)
          .map((e) => MediaHiddenTargetDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      decision: json['decision'] == null
          ? null
          : MediaCheckDtoDecision.fromJson(json['decision'] as String),
      previewUrl: json['previewUrl'] as String?,
      createdAt: json['createdAt'] as String,
      checkedAt: json['checkedAt'] as String?,
    );

Map<String, dynamic> _$MediaCheckDtoToJson(MediaCheckDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'fileId': ?instance.fileId,
      'videoAssetId': ?instance.videoAssetId,
      'ownerUserId': instance.ownerUserId,
      'purpose': instance.purpose,
      'status': instance.status.toJson(),
      'csamStatus': instance.csamStatus.toJson(),
      'provider': ?instance.provider,
      'labels': instance.labels.map((e) => e.toJson()).toList(),
      'maxConfidence': ?instance.maxConfidence,
      'topLabel': ?instance.topLabel,
      'skipReason': ?instance.skipReason,
      'hiddenTargets': instance.hiddenTargets.map((e) => e.toJson()).toList(),
      'decision': ?instance.decision?.toJson(),
      'previewUrl': ?instance.previewUrl,
      'createdAt': instance.createdAt,
      'checkedAt': ?instance.checkedAt,
    };
