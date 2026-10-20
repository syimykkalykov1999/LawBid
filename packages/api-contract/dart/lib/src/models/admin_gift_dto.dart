// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_gift_dto_status.dart';

part 'admin_gift_dto.g.dart';

@JsonSerializable()
class AdminGiftDto {
  const AdminGiftDto({
    required this.id,
    required this.title,
    required this.priceStars,
    required this.fileId,
    required this.url,
    required this.position,
    required this.status,
    required this.sentCount,
    required this.createdAt,
  });

  factory AdminGiftDto.fromJson(Map<String, Object?> json) =>
      _$AdminGiftDtoFromJson(json);

  final String id;
  final String title;
  final int priceStars;
  final String fileId;
  final String? url;
  final int position;
  final AdminGiftDtoStatus status;
  final int sentCount;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminGiftDtoToJson(this);
}
