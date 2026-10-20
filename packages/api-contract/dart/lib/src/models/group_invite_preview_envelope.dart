// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_invite_preview_dto.dart';
import 'response_meta_dto.dart';

part 'group_invite_preview_envelope.g.dart';

@JsonSerializable()
class GroupInvitePreviewEnvelope {
  const GroupInvitePreviewEnvelope({required this.data, this.meta});

  factory GroupInvitePreviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$GroupInvitePreviewEnvelopeFromJson(json);

  final GroupInvitePreviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$GroupInvitePreviewEnvelopeToJson(this);
}
