// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'quick_reply_dto.dart';

part 'quick_reply_list_dto.g.dart';

@JsonSerializable()
class QuickReplyListDto {
  const QuickReplyListDto({required this.items});

  factory QuickReplyListDto.fromJson(Map<String, Object?> json) =>
      _$QuickReplyListDtoFromJson(json);

  final List<QuickReplyDto> items;

  Map<String, Object?> toJson() => _$QuickReplyListDtoToJson(this);
}
