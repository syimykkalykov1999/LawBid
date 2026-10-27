// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'report_reason.dart';

part 'report_sticker_pack_dto.g.dart';

@JsonSerializable()
class ReportStickerPackDto {
  const ReportStickerPackDto({required this.reason, this.note});

  factory ReportStickerPackDto.fromJson(Map<String, Object?> json) =>
      _$ReportStickerPackDtoFromJson(json);

  final ReportReason reason;
  final String? note;

  Map<String, Object?> toJson() => _$ReportStickerPackDtoToJson(this);
}
