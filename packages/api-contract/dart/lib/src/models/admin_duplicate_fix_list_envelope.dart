// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_duplicate_fix_dto.dart';
import 'response_meta_dto.dart';

part 'admin_duplicate_fix_list_envelope.g.dart';

@JsonSerializable()
class AdminDuplicateFixListEnvelope {
  const AdminDuplicateFixListEnvelope({required this.data, this.meta});

  factory AdminDuplicateFixListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminDuplicateFixListEnvelopeFromJson(json);

  final List<AdminDuplicateFixDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminDuplicateFixListEnvelopeToJson(this);
}
