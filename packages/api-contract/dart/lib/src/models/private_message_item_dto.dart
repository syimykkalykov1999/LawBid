// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'private_message_item_dto.g.dart';

@JsonSerializable()
class PrivateMessageItemDto {
  const PrivateMessageItemDto({
    required this.id,
    required this.senderId,
    required this.type,
    required this.createdAt,
    required this.deleted,
    required this.fileName,
    required this.durationMs,
    required this.bodyHidden,
  });

  factory PrivateMessageItemDto.fromJson(Map<String, Object?> json) =>
      _$PrivateMessageItemDtoFromJson(json);

  final String id;
  final String? senderId;
  final String type;
  final DateTime createdAt;
  final bool deleted;
  final String? fileName;
  final num? durationMs;

  /// Always true: the text is hidden until revealed.
  final bool bodyHidden;

  Map<String, Object?> toJson() => _$PrivateMessageItemDtoToJson(this);
}
