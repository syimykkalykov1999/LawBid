// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_member_dto.dart';
import 'response_meta_dto.dart';

part 'group_member_list_envelope.g.dart';

@JsonSerializable()
class GroupMemberListEnvelope {
  const GroupMemberListEnvelope({required this.data, this.meta});

  factory GroupMemberListEnvelope.fromJson(Map<String, Object?> json) =>
      _$GroupMemberListEnvelopeFromJson(json);

  final List<GroupMemberDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$GroupMemberListEnvelopeToJson(this);
}
