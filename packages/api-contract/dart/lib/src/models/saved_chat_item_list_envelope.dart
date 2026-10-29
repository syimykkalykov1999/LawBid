// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'saved_chat_item_dto.dart';

part 'saved_chat_item_list_envelope.g.dart';

@JsonSerializable()
class SavedChatItemListEnvelope {
  const SavedChatItemListEnvelope({
    required this.data,
    this.meta,
  });
  
  factory SavedChatItemListEnvelope.fromJson(Map<String, Object?> json) => _$SavedChatItemListEnvelopeFromJson(json);
  
  final List<SavedChatItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SavedChatItemListEnvelopeToJson(this);
}
