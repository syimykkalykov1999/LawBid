// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'portal_session_dto.dart';
import 'response_meta_dto.dart';

part 'portal_session_envelope.g.dart';

@JsonSerializable()
class PortalSessionEnvelope {
  const PortalSessionEnvelope({required this.data, this.meta});

  factory PortalSessionEnvelope.fromJson(Map<String, Object?> json) =>
      _$PortalSessionEnvelopeFromJson(json);

  final PortalSessionDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PortalSessionEnvelopeToJson(this);
}
