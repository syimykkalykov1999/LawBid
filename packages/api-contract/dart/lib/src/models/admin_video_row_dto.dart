// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_video_row_dto_post_status.dart';
import 'admin_video_row_dto_status.dart';

part 'admin_video_row_dto.g.dart';

@JsonSerializable()
class AdminVideoRowDto {
  const AdminVideoRowDto({
    required this.id,
    required this.status,
    required this.ownerId,
    required this.ownerName,
    required this.createdAt,
    this.postId,
    this.postStatus,
    this.durationSec,
    this.sizeBytes,
    this.failureReason,
    this.playbackUrl,
    this.thumbnailUrl,
    this.readyAt,
    this.deletedAt,
  });

  factory AdminVideoRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminVideoRowDtoFromJson(json);

  final String id;
  final AdminVideoRowDtoStatus status;
  final String ownerId;
  final String ownerName;
  final String? postId;

  /// The linked post's status (removed if deleted).
  final AdminVideoRowDtoPostStatus? postStatus;
  final int? durationSec;
  final int? sizeBytes;
  final String? failureReason;

  /// Signed HLS link (ready videos while video is configured).
  final String? playbackUrl;
  final String? thumbnailUrl;
  final DateTime createdAt;
  final DateTime? readyAt;
  final DateTime? deletedAt;

  Map<String, Object?> toJson() => _$AdminVideoRowDtoToJson(this);
}
