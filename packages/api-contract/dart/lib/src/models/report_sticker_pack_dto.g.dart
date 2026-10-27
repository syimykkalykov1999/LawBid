// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'report_sticker_pack_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReportStickerPackDto _$ReportStickerPackDtoFromJson(
  Map<String, dynamic> json,
) => ReportStickerPackDto(
  reason: ReportReason.fromJson(json['reason'] as String),
  note: json['note'] as String?,
);

Map<String, dynamic> _$ReportStickerPackDtoToJson(
  ReportStickerPackDto instance,
) => <String, dynamic>{
  'reason': instance.reason.toJson(),
  'note': ?instance.note,
};
