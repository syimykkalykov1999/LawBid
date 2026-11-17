// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_disclosure_dto.dart';
import 'hotline_lawyer_dto.dart';
import 'hotline_request_status.dart';

part 'hotline_request_view_dto.g.dart';

@JsonSerializable()
class HotlineRequestViewDto {
  const HotlineRequestViewDto({
    required this.id,
    required this.status,
    this.positionBand,
    this.waitBand,
    this.endReason,
    this.lawyer,
    this.notifyUntil,
    this.disclosure,
    this.callId,
    this.conversationId,
  });

  factory HotlineRequestViewDto.fromJson(Map<String, Object?> json) =>
      _$HotlineRequestViewDtoFromJson(json);

  final String id;
  final HotlineRequestStatus status;

  /// Rough place: 1, 2-5, 6-20, 20+ (never exact).
  final String? positionBand;

  /// Rough wait: lt5, 5to15, 15to30, gt30 (minutes).
  final String? waitBand;

  /// cancelled, lost, queue_full, notify_expired, notify_exhausted («Мы не дозвонились, оставьте заявку снова»), time_limit, ended
  final String? endReason;
  final HotlineLawyerDto? lawyer;

  /// ms; «Сообщите мне» ends
  final num? notifyUntil;
  final HotlineDisclosureDto? disclosure;

  /// The 1:1 voice call while connected (GET /calls/:id).
  final String? callId;

  /// The direct chat of the two after the call.
  final String? conversationId;

  Map<String, Object?> toJson() => _$HotlineRequestViewDtoToJson(this);
}
