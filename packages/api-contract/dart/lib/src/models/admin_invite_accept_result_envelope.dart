// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_invite_accept_result_dto.dart';
import 'response_meta_dto.dart';

part 'admin_invite_accept_result_envelope.g.dart';

@JsonSerializable()
class AdminInviteAcceptResultEnvelope {
  const AdminInviteAcceptResultEnvelope({required this.data, this.meta});

  factory AdminInviteAcceptResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminInviteAcceptResultEnvelopeFromJson(json);

  final AdminInviteAcceptResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminInviteAcceptResultEnvelopeToJson(this);
}
