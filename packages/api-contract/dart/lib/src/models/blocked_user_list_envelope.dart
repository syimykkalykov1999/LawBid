// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'blocked_user_dto.dart';
import 'response_meta_dto.dart';

part 'blocked_user_list_envelope.g.dart';

@JsonSerializable()
class BlockedUserListEnvelope {
  const BlockedUserListEnvelope({required this.data, this.meta});

  factory BlockedUserListEnvelope.fromJson(Map<String, Object?> json) =>
      _$BlockedUserListEnvelopeFromJson(json);

  final List<BlockedUserDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BlockedUserListEnvelopeToJson(this);
}
