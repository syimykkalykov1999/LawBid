// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_practice_area_dto.dart';
import 'response_meta_dto.dart';

part 'admin_practice_area_list_envelope.g.dart';

@JsonSerializable()
class AdminPracticeAreaListEnvelope {
  const AdminPracticeAreaListEnvelope({required this.data, this.meta});

  factory AdminPracticeAreaListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminPracticeAreaListEnvelopeFromJson(json);

  final List<AdminPracticeAreaDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminPracticeAreaListEnvelopeToJson(this);
}
