// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'saved_chat_ids_dto.dart';

part 'saved_chat_ids_envelope.g.dart';

@JsonSerializable()
class SavedChatIdsEnvelope {
  const SavedChatIdsEnvelope({required this.data, this.meta});

  factory SavedChatIdsEnvelope.fromJson(Map<String, Object?> json) =>
      _$SavedChatIdsEnvelopeFromJson(json);

  final SavedChatIdsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SavedChatIdsEnvelopeToJson(this);
}
