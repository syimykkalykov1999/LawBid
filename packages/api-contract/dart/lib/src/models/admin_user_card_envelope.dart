// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_user_card_dto.dart';
import 'response_meta_dto.dart';

part 'admin_user_card_envelope.g.dart';

@JsonSerializable()
class AdminUserCardEnvelope {
  const AdminUserCardEnvelope({required this.data, this.meta});

  factory AdminUserCardEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminUserCardEnvelopeFromJson(json);

  final AdminUserCardDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminUserCardEnvelopeToJson(this);
}
