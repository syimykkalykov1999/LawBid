// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_demo_invite_dto.dart';
import 'response_meta_dto.dart';

part 'admin_demo_invite_envelope.g.dart';

@JsonSerializable()
class AdminDemoInviteEnvelope {
  const AdminDemoInviteEnvelope({required this.data, this.meta});

  factory AdminDemoInviteEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminDemoInviteEnvelopeFromJson(json);

  final AdminDemoInviteDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminDemoInviteEnvelopeToJson(this);
}
