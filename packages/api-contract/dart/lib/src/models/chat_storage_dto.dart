// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'chat_storage_dto.g.dart';

@JsonSerializable()
class ChatStorageDto {
  const ChatStorageDto({
    required this.photos,
    required this.documents,
    required this.voice,
    required this.usedBytes,
    required this.quotaBytes,
  });

  factory ChatStorageDto.fromJson(Map<String, Object?> json) =>
      _$ChatStorageDtoFromJson(json);

  final num photos;
  final num documents;
  final num voice;

  /// Bytes of every file sent in the chat.
  final num usedBytes;

  /// The per-chat cap in bytes; null = no cap.
  final num? quotaBytes;

  Map<String, Object?> toJson() => _$ChatStorageDtoToJson(this);
}
