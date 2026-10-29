// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'qr_login_created_dto.dart';
import 'response_meta_dto.dart';

part 'qr_login_created_envelope.g.dart';

@JsonSerializable()
class QrLoginCreatedEnvelope {
  const QrLoginCreatedEnvelope({
    required this.data,
    this.meta,
  });
  
  factory QrLoginCreatedEnvelope.fromJson(Map<String, Object?> json) => _$QrLoginCreatedEnvelopeFromJson(json);
  
  final QrLoginCreatedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$QrLoginCreatedEnvelopeToJson(this);
}
