// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'language_admin_dto.dart';
import 'response_meta_dto.dart';

part 'language_admin_envelope.g.dart';

@JsonSerializable()
class LanguageAdminEnvelope {
  const LanguageAdminEnvelope({required this.data, this.meta});

  factory LanguageAdminEnvelope.fromJson(Map<String, Object?> json) =>
      _$LanguageAdminEnvelopeFromJson(json);

  final LanguageAdminDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$LanguageAdminEnvelopeToJson(this);
}
