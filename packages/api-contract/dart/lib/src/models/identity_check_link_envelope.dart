// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'identity_check_link_dto.dart';
import 'response_meta_dto.dart';

part 'identity_check_link_envelope.g.dart';

@JsonSerializable()
class IdentityCheckLinkEnvelope {
  const IdentityCheckLinkEnvelope({required this.data, this.meta});

  factory IdentityCheckLinkEnvelope.fromJson(Map<String, Object?> json) =>
      _$IdentityCheckLinkEnvelopeFromJson(json);

  final IdentityCheckLinkDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$IdentityCheckLinkEnvelopeToJson(this);
}
