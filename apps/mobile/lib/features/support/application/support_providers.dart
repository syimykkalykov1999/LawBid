import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/support/data/support_repository.dart';
import 'package:lawbid/features/support/domain/support_models.dart';

final supportRepositoryProvider = Provider<SupportRepository>(
  (ref) => SupportRepository(ref.watch(dioProvider)),
);

/// My tickets, newest activity first (the list screen and its unread dot).
final supportTicketsProvider = FutureProvider.autoDispose<List<SupportTicket>>(
  (ref) => ref.watch(supportRepositoryProvider).tickets(),
);

/// One ticket with its messages.
final supportTicketProvider =
    FutureProvider.autoDispose.family<SupportTicket, String>(
  (ref, id) => ref.watch(supportRepositoryProvider).ticket(id),
);

/// Any ticket with a reply I haven't read — the dot on "Help & support".
final supportUnreadProvider = Provider.autoDispose<bool>(
  (ref) =>
      ref.watch(supportTicketsProvider).value?.any((t) => t.unread) ?? false,
);
