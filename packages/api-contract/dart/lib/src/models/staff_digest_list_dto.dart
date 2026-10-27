// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_digest_dto.dart';

part 'staff_digest_list_dto.g.dart';

@JsonSerializable()
class StaffDigestListDto {
  const StaffDigestListDto({required this.items});

  factory StaffDigestListDto.fromJson(Map<String, Object?> json) =>
      _$StaffDigestListDtoFromJson(json);

  /// Newest first, ≤ 8.
  final List<StaffDigestDto> items;

  Map<String, Object?> toJson() => _$StaffDigestListDtoToJson(this);
}
