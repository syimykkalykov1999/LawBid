// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'private_messages_page_dto.dart';
import 'response_meta_dto.dart';

part 'private_messages_page_envelope.g.dart';

@JsonSerializable()
class PrivateMessagesPageEnvelope {
  const PrivateMessagesPageEnvelope({required this.data, this.meta});

  factory PrivateMessagesPageEnvelope.fromJson(Map<String, Object?> json) =>
      _$PrivateMessagesPageEnvelopeFromJson(json);

  final PrivateMessagesPageDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PrivateMessagesPageEnvelopeToJson(this);
}
