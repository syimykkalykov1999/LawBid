// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_invite_preview_detail_dto.dart';
import 'response_meta_dto.dart';

part 'group_invite_preview_detail_envelope.g.dart';

@JsonSerializable()
class GroupInvitePreviewDetailEnvelope {
  const GroupInvitePreviewDetailEnvelope({required this.data, this.meta});

  factory GroupInvitePreviewDetailEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$GroupInvitePreviewDetailEnvelopeFromJson(json);

  final GroupInvitePreviewDetailDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$GroupInvitePreviewDetailEnvelopeToJson(this);
}
