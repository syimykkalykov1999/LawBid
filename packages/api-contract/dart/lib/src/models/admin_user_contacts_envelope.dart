// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_user_contacts_dto.dart';
import 'response_meta_dto.dart';

part 'admin_user_contacts_envelope.g.dart';

@JsonSerializable()
class AdminUserContactsEnvelope {
  const AdminUserContactsEnvelope({required this.data, this.meta});

  factory AdminUserContactsEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminUserContactsEnvelopeFromJson(json);

  final AdminUserContactsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminUserContactsEnvelopeToJson(this);
}
