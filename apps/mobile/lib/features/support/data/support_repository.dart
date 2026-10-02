import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/support/domain/support_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-02 — `/support/tickets` (docs: admin "Support" desk).
class SupportRepository {
  SupportRepository(Dio dio) : _api = api.SupportClient(dio);

  final api.SupportClient _api;

  Future<List<SupportTicket>> tickets() async {
    final out = <SupportTicket>[];
    String? cursor;
    // The list is small; read a few pages so nothing is hidden.
    for (var i = 0; i < 5; i++) {
      final env = await guardApiCall(
        () => _api.listMySupportTickets(cursor: cursor),
      );
      out.addAll(env.data.map(_ticket));
      cursor = env.meta?.nextCursor;
      if (cursor == null || cursor.isEmpty) break;
    }
    return out;
  }

  Future<SupportTicket> ticket(String id) async =>
      _detail((await guardApiCall(() => _api.getMySupportTicket(id: id))).data);

  Future<SupportTicket> create({
    required SupportCategory category,
    required String subject,
    required String body,
  }) async =>
      _detail(
        (await guardApiCall(
          () => _api.createSupportTicket(
            body: api.CreateSupportTicketDto(
              subject: subject,
              category: api.CreateSupportTicketDtoCategory.fromJson(
                category.wire,
              ),
              body: body,
            ),
            extras: const {RequestFlags.createsResource: true},
          ),
        ))
            .data,
      );

  Future<SupportMessage> reply(String id, String body) async => _message(
        (await guardApiCall(
          () => _api.replyToSupportTicket(
            id: id,
            body: api.SupportMessageBodyDto(body: body),
            extras: const {RequestFlags.createsResource: true},
          ),
        ))
            .data,
      );

  Future<void> close(String id) =>
      guardApiCall(() => _api.closeMySupportTicket(id: id));

  static SupportTicket _ticket(api.SupportTicketDto d) => SupportTicket(
        id: d.id,
        subject: d.subject,
        category: SupportCategory.from(d.category.json),
        status: SupportStatus.from(d.status.json),
        unread: d.unread,
        canReply: d.canReply,
        lastMessageAt: d.lastMessageAt,
        createdAt: d.createdAt,
      );

  static SupportTicket _detail(api.SupportTicketDetailDto d) => SupportTicket(
        id: d.id,
        subject: d.subject,
        category: SupportCategory.from(d.category.json),
        status: SupportStatus.from(d.status.json),
        unread: d.unread,
        canReply: d.canReply,
        lastMessageAt: d.lastMessageAt,
        createdAt: d.createdAt,
        messages: d.messages.map(_message).toList(),
      );

  static SupportMessage _message(api.SupportMessageDto d) => SupportMessage(
        id: d.id,
        fromTeam: d.author == api.SupportMessageDtoAuthor.support,
        body: d.body,
        createdAt: d.createdAt,
        authorName: d.authorName,
      );
}
