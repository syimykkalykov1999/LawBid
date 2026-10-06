// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'dmca_notice_brief_dto.dart';
import 'response_meta_dto.dart';

part 'dmca_notice_brief_envelope.g.dart';

@JsonSerializable()
class DmcaNoticeBriefEnvelope {
  const DmcaNoticeBriefEnvelope({required this.data, this.meta});

  factory DmcaNoticeBriefEnvelope.fromJson(Map<String, Object?> json) =>
      _$DmcaNoticeBriefEnvelopeFromJson(json);

  final DmcaNoticeBriefDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DmcaNoticeBriefEnvelopeToJson(this);
}
