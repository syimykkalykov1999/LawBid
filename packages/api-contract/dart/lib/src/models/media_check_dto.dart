// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'media_check_dto_csam_status.dart';
import 'media_check_dto_decision.dart';
import 'media_check_dto_status.dart';
import 'media_hidden_target_dto.dart';
import 'media_label_dto.dart';

part 'media_check_dto.g.dart';

@JsonSerializable()
class MediaCheckDto {
  const MediaCheckDto({
    required this.id,
    required this.fileId,
    required this.videoAssetId,
    required this.ownerUserId,
    required this.purpose,
    required this.status,
    required this.csamStatus,
    required this.provider,
    required this.labels,
    required this.maxConfidence,
    required this.topLabel,
    required this.skipReason,
    required this.hiddenTargets,
    required this.decision,
    required this.previewUrl,
    required this.createdAt,
    required this.checkedAt,
  });

  factory MediaCheckDto.fromJson(Map<String, Object?> json) =>
      _$MediaCheckDtoFromJson(json);

  final String id;
  final String? fileId;
  final String? videoAssetId;
  final String ownerUserId;

  /// File purpose, or reel
  final String purpose;
  final MediaCheckDtoStatus status;
  final MediaCheckDtoCsamStatus csamStatus;
  final String? provider;
  final List<MediaLabelDto> labels;
  final num? maxConfidence;
  final String? topLabel;
  final String? skipReason;
  final List<MediaHiddenTargetDto> hiddenTargets;
  final MediaCheckDtoDecision? decision;

  /// Signed 5-minute preview; never for a CSAM match
  final String? previewUrl;
  final String createdAt;
  final String? checkedAt;

  Map<String, Object?> toJson() => _$MediaCheckDtoToJson(this);
}
