// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_accepting_dto.g.dart';

@JsonSerializable()
class HotlineAcceptingDto {
  const HotlineAcceptingDto({required this.accepting});

  factory HotlineAcceptingDto.fromJson(Map<String, Object?> json) =>
      _$HotlineAcceptingDtoFromJson(json);

  final bool accepting;

  Map<String, Object?> toJson() => _$HotlineAcceptingDtoToJson(this);
}
