// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_disclosure_kind.dart';

part 'hotline_disclosure_dto.g.dart';

@JsonSerializable()
class HotlineDisclosureDto {
  const HotlineDisclosureDto({
    required this.version,
    this.key,
    this.kind,
    this.ru,
    this.en,
  });

  factory HotlineDisclosureDto.fromJson(Map<String, Object?> json) =>
      _$HotlineDisclosureDtoFromJson(json);

  /// Text key (hotline.disclosure.client_wait / hotline.disclosure.attorney_offer / hotline.notice.short); null = show nothing (already seen).
  final String? key;
  final HotlineDisclosureKind? kind;

  /// hotline.disclosure_version
  final num version;
  final String? ru;
  final String? en;

  Map<String, Object?> toJson() => _$HotlineDisclosureDtoToJson(this);
}
