import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_providers.dart';
import 'package:lawbid/features/groups/e2ee/group_e2ee_api.dart';
import 'package:lawbid/features/groups/e2ee/group_e2ee_service.dart';

/// G2: the signed-in account's end-to-end encryption of group chats (null
/// signed out). It shares the device's MLS client, its decrypted-messages
/// store and its backup with the chats ([e2eeServiceProvider]).
final groupE2eeServiceProvider = Provider<GroupE2eeService?>((ref) {
  final chat = ref.watch(e2eeServiceProvider);
  if (chat == null) return null;
  final service = GroupE2eeService(
    api: DioGroupE2eeApi(ref.watch(dioProvider)),
    chat: chat,
    ownerId: chat.ownerId,
    plaintexts: chat.plaintexts,
  );
  GroupE2eeService.current = service;
  ref.onDispose(() {
    if (identical(GroupE2eeService.current, service)) {
      GroupE2eeService.current = null;
    }
    unawaited(service.close());
  });
  return service;
});
