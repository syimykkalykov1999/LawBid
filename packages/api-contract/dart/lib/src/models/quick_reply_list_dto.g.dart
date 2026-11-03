// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'quick_reply_list_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QuickReplyListDto _$QuickReplyListDtoFromJson(Map<String, dynamic> json) =>
    QuickReplyListDto(
      items: (json['items'] as List<dynamic>)
          .map((e) => QuickReplyDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$QuickReplyListDtoToJson(QuickReplyListDto instance) =>
    <String, dynamic>{'items': instance.items.map((e) => e.toJson()).toList()};
