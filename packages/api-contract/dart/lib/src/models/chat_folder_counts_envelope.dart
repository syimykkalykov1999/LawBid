// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'chat_folder_counts_dto.dart';
import 'response_meta_dto.dart';

part 'chat_folder_counts_envelope.g.dart';

@JsonSerializable()
class ChatFolderCountsEnvelope {
  const ChatFolderCountsEnvelope({required this.data, this.meta});

  factory ChatFolderCountsEnvelope.fromJson(Map<String, Object?> json) =>
      _$ChatFolderCountsEnvelopeFromJson(json);

  final ChatFolderCountsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ChatFolderCountsEnvelopeToJson(this);
}
