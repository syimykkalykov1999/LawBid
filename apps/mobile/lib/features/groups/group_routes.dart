/// Owner 2026-10-20: group chat routes. The router wiring itself lives in
/// `group_router.dart`.
abstract final class GroupRoutes {
  /// A group chat; `?topic=<id>` opens one topic of a forum group.
  static const groupPattern = '/group/:id';
  static String group(String id, {String? topicId}) =>
      '/group/${Uri.encodeComponent(id)}'
      '${topicId == null ? '' : '?topic=${Uri.encodeComponent(topicId)}'}';

  /// Group info / settings / members.
  static const infoPattern = '/group/:id/info';
  static String info(String id) => '/group/${Uri.encodeComponent(id)}/info';

  /// «New group» (pick people, name, type).
  static const create = '/group/new';

  /// «Find groups» (public search).
  static const find = '/groups/find';

  /// Owner 2026-10-21: a group invitation card opened from Requests: look
  /// inside, then accept or decline.
  static const invitePattern = '/group-invite/:id';
  static String invite(String id) => '/group-invite/${Uri.encodeComponent(id)}';

  /// An invite link / @username: https://lawbid.dev/g/<code>.
  static const joinPattern = '/g/:code';
  static String join(String code) => '/g/${Uri.encodeComponent(code)}';
}
