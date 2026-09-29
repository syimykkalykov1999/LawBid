// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'client_contacts_dto.dart';
import 'response_meta_dto.dart';

part 'client_contacts_envelope.g.dart';

@JsonSerializable()
class ClientContactsEnvelope {
  const ClientContactsEnvelope({required this.data, this.meta});

  factory ClientContactsEnvelope.fromJson(Map<String, Object?> json) =>
      _$ClientContactsEnvelopeFromJson(json);

  final ClientContactsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ClientContactsEnvelopeToJson(this);
}
