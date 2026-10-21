// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'gift_dto.dart';

part 'gift_send_dto.g.dart';

@JsonSerializable()
class GiftSendDto {
  const GiftSendDto({
    required this.id,
    required this.gift,
    required this.anonymous,
    required this.shown,
    required this.createdAt,
    this.senderId,
    this.senderName,
    this.note,
    this.convertedStars,
  });

  factory GiftSendDto.fromJson(Map<String, Object?> json) =>
      _$GiftSendDtoFromJson(json);

  final String id;
  final GiftDto gift;
  final String? senderId;
  final String? senderName;
  final bool anonymous;
  final String? note;
  final bool shown;
  final int? convertedStars;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$GiftSendDtoToJson(this);
}
