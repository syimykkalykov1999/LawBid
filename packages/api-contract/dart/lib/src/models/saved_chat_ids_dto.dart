// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'saved_chat_ids_dto.g.dart';

@JsonSerializable()
class SavedChatIdsDto {
  const SavedChatIdsDto({
    required this.ids,
  });
  
  factory SavedChatIdsDto.fromJson(Map<String, Object?> json) => _$SavedChatIdsDtoFromJson(json);
  
  /// Ids of every saved message (newest 5000).
  final List<String> ids;

  Map<String, Object?> toJson() => _$SavedChatIdsDtoToJson(this);
}
