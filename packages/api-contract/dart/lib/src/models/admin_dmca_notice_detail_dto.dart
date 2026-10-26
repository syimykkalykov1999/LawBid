// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_dmca_notice_row_dto.dart';
import 'moderation_card_dto.dart';

part 'admin_dmca_notice_detail_dto.g.dart';

@JsonSerializable()
class AdminDmcaNoticeDetailDto {
  const AdminDmcaNoticeDetailDto({
    required this.notice,
    required this.strikesToSuspend,
    this.target,
    this.authorStrikes,
  });

  factory AdminDmcaNoticeDetailDto.fromJson(Map<String, Object?> json) =>
      _$AdminDmcaNoticeDetailDtoFromJson(json);

  final AdminDmcaNoticeRowDto notice;

  /// The moderation card of the target; null for a URL-only notice or a vanished object.
  final ModerationCardDto? target;

  /// The content author's DMCA strikes so far (null without an author).
  final int? authorStrikes;

  /// Strikes after which the author is suspended (0 = never).
  final int strikesToSuspend;

  Map<String, Object?> toJson() => _$AdminDmcaNoticeDetailDtoToJson(this);
}
