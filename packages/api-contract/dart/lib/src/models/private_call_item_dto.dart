// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'private_call_item_dto.g.dart';

@JsonSerializable()
class PrivateCallItemDto {
  const PrivateCallItemDto({
    required this.id,
    required this.callerId,
    required this.calleeId,
    required this.status,
    required this.video,
    required this.isGroup,
    required this.answeredAt,
    required this.endedAt,
    required this.durationSec,
    required this.endReason,
    required this.createdAt,
  });

  factory PrivateCallItemDto.fromJson(Map<String, Object?> json) =>
      _$PrivateCallItemDtoFromJson(json);

  final String id;
  final String callerId;
  final String calleeId;
  final String status;
  final bool video;
  final bool isGroup;
  final DateTime? answeredAt;
  final DateTime? endedAt;
  final num? durationSec;
  final String? endReason;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$PrivateCallItemDtoToJson(this);
}
