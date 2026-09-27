// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contact_verified_dto.dart';
import 'response_meta_dto.dart';

part 'contact_verified_envelope.g.dart';

@JsonSerializable()
class ContactVerifiedEnvelope {
  const ContactVerifiedEnvelope({required this.data, this.meta});

  factory ContactVerifiedEnvelope.fromJson(Map<String, Object?> json) =>
      _$ContactVerifiedEnvelopeFromJson(json);

  final ContactVerifiedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ContactVerifiedEnvelopeToJson(this);
}
