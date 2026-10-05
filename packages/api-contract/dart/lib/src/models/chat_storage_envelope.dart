// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'chat_storage_dto.dart';
import 'response_meta_dto.dart';

part 'chat_storage_envelope.g.dart';

@JsonSerializable()
class ChatStorageEnvelope {
  const ChatStorageEnvelope({required this.data, this.meta});

  factory ChatStorageEnvelope.fromJson(Map<String, Object?> json) =>
      _$ChatStorageEnvelopeFromJson(json);

  final ChatStorageDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ChatStorageEnvelopeToJson(this);
}
