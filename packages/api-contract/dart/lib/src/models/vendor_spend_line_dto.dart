// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'vendor_spend_line_dto.g.dart';

@JsonSerializable()
class VendorSpendLineDto {
  const VendorSpendLineDto({
    required this.label,
    required this.usd,
    required this.note,
  });

  factory VendorSpendLineDto.fromJson(Map<String, Object?> json) =>
      _$VendorSpendLineDtoFromJson(json);

  final String label;
  final num usd;
  final String? note;

  Map<String, Object?> toJson() => _$VendorSpendLineDtoToJson(this);
}
