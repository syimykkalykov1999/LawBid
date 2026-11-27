// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_mls_welcome_dto.dart';
import 'response_meta_dto.dart';

part 'group_mls_welcome_list_envelope.g.dart';

@JsonSerializable()
class GroupMlsWelcomeListEnvelope {
  const GroupMlsWelcomeListEnvelope({required this.data, this.meta});

  factory GroupMlsWelcomeListEnvelope.fromJson(Map<String, Object?> json) =>
      _$GroupMlsWelcomeListEnvelopeFromJson(json);

  final List<GroupMlsWelcomeDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$GroupMlsWelcomeListEnvelopeToJson(this);
}
