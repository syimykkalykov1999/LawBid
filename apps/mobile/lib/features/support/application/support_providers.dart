import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/startup/app_session.dart';
import 'package:lawbid/features/support/data/support_repository.dart';
import 'package:lawbid/features/support/domain/support_models.dart';

final supportRepositoryProvider = Provider<SupportRepository>(
  (ref) => SupportRepository(ref.watch(dioProvider)),
);

/// My tickets, newest activity first (the list screen and its unread dot).
final supportTicketsProvider = FutureProvider.autoDispose<List<SupportTicket>>(
  (ref) => ref.watch(supportRepositoryProvider).tickets(),
);

/// When the team answers (hours, after-hours notice).
final supportInfoProvider = FutureProvider.autoDispose<SupportInfo>(
  (ref) => ref.watch(supportRepositoryProvider).info(),
);

/// One ticket with its messages.
final supportTicketProvider =
    FutureProvider.autoDispose.family<SupportTicket, String>(
  (ref, id) => ref.watch(supportRepositoryProvider).ticket(id),
);

/// Any ticket with a reply I haven't read — the dot on "Help & support".
final supportUnreadProvider = Provider.autoDispose<bool>((ref) {
  // Owner 2026-10-22 (package G): the start's one answer says whether a
  // ticket has an unread reply — the list is not read for the dot.
  final session = ref.watch(appSessionProvider);
  if (session != null) return session.unreadSupport > 0;
  return ref.watch(supportTicketsProvider).value?.any((t) => t.unread) ?? false;
});
