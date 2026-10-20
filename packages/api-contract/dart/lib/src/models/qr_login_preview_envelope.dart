// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'qr_login_preview_dto.dart';
import 'response_meta_dto.dart';

part 'qr_login_preview_envelope.g.dart';

@JsonSerializable()
class QrLoginPreviewEnvelope {
  const QrLoginPreviewEnvelope({required this.data, this.meta});

  factory QrLoginPreviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$QrLoginPreviewEnvelopeFromJson(json);

  final QrLoginPreviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$QrLoginPreviewEnvelopeToJson(this);
}
