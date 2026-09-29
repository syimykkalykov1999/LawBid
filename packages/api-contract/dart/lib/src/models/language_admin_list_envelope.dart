// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'language_admin_dto.dart';
import 'response_meta_dto.dart';

part 'language_admin_list_envelope.g.dart';

@JsonSerializable()
class LanguageAdminListEnvelope {
  const LanguageAdminListEnvelope({required this.data, this.meta});

  factory LanguageAdminListEnvelope.fromJson(Map<String, Object?> json) =>
      _$LanguageAdminListEnvelopeFromJson(json);

  final List<LanguageAdminDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$LanguageAdminListEnvelopeToJson(this);
}
