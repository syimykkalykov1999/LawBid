// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'minor_row_dto.dart';

part 'minors_list_dto.g.dart';

@JsonSerializable()
class MinorsListDto {
  const MinorsListDto({required this.items});

  factory MinorsListDto.fromJson(Map<String, Object?> json) =>
      _$MinorsListDtoFromJson(json);

  final List<MinorRowDto> items;

  Map<String, Object?> toJson() => _$MinorsListDtoToJson(this);
}
