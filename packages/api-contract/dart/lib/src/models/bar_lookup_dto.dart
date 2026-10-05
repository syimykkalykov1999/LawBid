// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'bar_lookup_dto.g.dart';

@JsonSerializable()
class BarLookupDto {
  const BarLookupDto({
    required this.stateCode,
    required this.stateName,
    required this.barNumber,
    required this.licenseStatus,
    required this.url,
    required this.prefilled,
    required this.blocked,
  });

  factory BarLookupDto.fromJson(Map<String, Object?> json) =>
      _$BarLookupDtoFromJson(json);

  final String stateCode;
  final String stateName;
  final String barNumber;

  /// pending / verified / rejected …
  final String licenseStatus;
  final String? url;

  /// True: the page opens straight on this number. False: a search page, paste the number.
  final bool prefilled;

  /// This number is on the block list right now.
  final bool blocked;

  Map<String, Object?> toJson() => _$BarLookupDtoToJson(this);
}
