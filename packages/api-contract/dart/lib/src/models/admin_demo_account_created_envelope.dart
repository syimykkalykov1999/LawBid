// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_demo_account_created_dto.dart';
import 'response_meta_dto.dart';

part 'admin_demo_account_created_envelope.g.dart';

@JsonSerializable()
class AdminDemoAccountCreatedEnvelope {
  const AdminDemoAccountCreatedEnvelope({required this.data, this.meta});

  factory AdminDemoAccountCreatedEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminDemoAccountCreatedEnvelopeFromJson(json);

  final AdminDemoAccountCreatedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminDemoAccountCreatedEnvelopeToJson(this);
}
