// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_demo_accounts_page_dto.dart';
import 'response_meta_dto.dart';

part 'admin_demo_accounts_page_envelope.g.dart';

@JsonSerializable()
class AdminDemoAccountsPageEnvelope {
  const AdminDemoAccountsPageEnvelope({required this.data, this.meta});

  factory AdminDemoAccountsPageEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminDemoAccountsPageEnvelopeFromJson(json);

  final AdminDemoAccountsPageDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminDemoAccountsPageEnvelopeToJson(this);
}
