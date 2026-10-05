// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'firm_link_dto_source.dart';
import 'firm_link_dto_status.dart';

part 'firm_link_dto.g.dart';

@JsonSerializable()
class FirmLinkDto {
  const FirmLinkDto({
    required this.status,
    required this.source,
    required this.at,
    required this.emailDomain,
  });

  factory FirmLinkDto.fromJson(Map<String, Object?> json) =>
      _$FirmLinkDtoFromJson(json);

  final FirmLinkDtoStatus status;
  final FirmLinkDtoSource? source;
  final DateTime? at;

  /// Firm e-mail domain the attorney confirmed.
  final String? emailDomain;

  Map<String, Object?> toJson() => _$FirmLinkDtoToJson(this);
}
