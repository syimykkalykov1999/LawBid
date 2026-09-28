// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'public_attorney_profile_dto.dart';
import 'response_meta_dto.dart';

part 'public_attorney_profile_envelope.g.dart';

@JsonSerializable()
class PublicAttorneyProfileEnvelope {
  const PublicAttorneyProfileEnvelope({required this.data, this.meta});

  factory PublicAttorneyProfileEnvelope.fromJson(Map<String, Object?> json) =>
      _$PublicAttorneyProfileEnvelopeFromJson(json);

  final PublicAttorneyProfileDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PublicAttorneyProfileEnvelopeToJson(this);
}
