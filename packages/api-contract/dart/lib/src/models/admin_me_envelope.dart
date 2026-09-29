// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_me_dto.dart';
import 'response_meta_dto.dart';

part 'admin_me_envelope.g.dart';

@JsonSerializable()
class AdminMeEnvelope {
  const AdminMeEnvelope({required this.data, this.meta});

  factory AdminMeEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminMeEnvelopeFromJson(json);

  final AdminMeDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminMeEnvelopeToJson(this);
}
