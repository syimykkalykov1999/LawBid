// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_invite_dto.dart';
import 'response_meta_dto.dart';

part 'case_invite_envelope.g.dart';

@JsonSerializable()
class CaseInviteEnvelope {
  const CaseInviteEnvelope({required this.data, this.meta});

  factory CaseInviteEnvelope.fromJson(Map<String, Object?> json) =>
      _$CaseInviteEnvelopeFromJson(json);

  final CaseInviteDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CaseInviteEnvelopeToJson(this);
}
