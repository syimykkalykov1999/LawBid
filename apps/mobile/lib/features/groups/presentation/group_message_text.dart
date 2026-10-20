import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/groups/domain/group_message_ext.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

String _name(Translator t, api.GroupPersonDto? p) =>
    (p?.displayName?.trim().isNotEmpty ?? false)
        ? p!.displayName!.trim()
        : t.t('group.someone');

String _names(Translator t, List<api.GroupPersonDto> people) =>
    people.map((p) => _name(t, p)).join(', ');

/// The sentence of a system line («Ann added Bob»). `systemPeople` is the
/// actor first (when there is one), then the people it was done to.
String groupSystemText(Translator t, api.GroupMessageDto m) {
  final people = m.systemPeople ?? const <api.GroupPersonDto>[];
  final actor = people.isEmpty ? null : people.first;
  final targets =
      people.length > 1 ? people.sublist(1) : const <api.GroupPersonDto>[];
  final text = m.systemText ?? '';
  switch (m.systemKind) {
    case 'created':
      return t.t('group.system.created', {'name': _name(t, actor)});
    case 'added':
      return t.t('group.system.added', {
        'name': _name(t, actor),
        'people': _names(t, targets),
      });
    case 'joined':
      return t.t('group.system.joined', {'name': _name(t, actor)});
    case 'left':
      return t.t('group.system.left', {'name': _name(t, actor)});
    case 'removed':
      return t.t('group.system.removed', {
        'name': _name(t, actor),
        'people': _names(t, targets),
      });
    case 'removed_admin':
      return t.t('group.system.removedByAdmin', {
        'people': _names(t, targets),
      });
    case 'renamed':
      return t.t(
        'group.system.renamed',
        {'name': _name(t, actor), 'title': text},
      );
    case 'photo':
      return t.t('group.system.photo', {'name': _name(t, actor)});
    case 'description':
      return t.t('group.system.description', {'name': _name(t, actor)});
    case 'promoted':
      return t.t('group.system.promoted', {
        'name': _name(t, actor),
        'people': _names(t, targets),
      });
    case 'demoted':
      return t.t('group.system.demoted', {
        'name': _name(t, actor),
        'people': _names(t, targets),
      });
    case 'transferred':
      return t.t('group.system.transferred', {
        'name': _name(t, actor),
        'people': _names(t, targets),
      });
    case 'pinned':
      return t.t('group.system.pinned', {'name': _name(t, actor)});
    case 'topic_created':
      return t.t(
        'group.system.topicCreated',
        {'name': _name(t, actor), 'title': text},
      );
    default:
      return text;
  }
}

/// One line for the chat list / pin banner / reply preview: the text, or
/// what the message is («Photo», «Poll: …», a system sentence). With
/// [withSender] the author leads («Ann: Hello»).
String groupMessagePreview(
  Translator t,
  api.GroupMessageDto m, {
  bool withSender = false,
}) {
  if (m.deleted) return t.t('group.message.deleted');
  if (m.isSystem) return groupSystemText(t, m);
  final String body;
  if (m.isPoll) {
    body = t.t('group.preview.poll', {'question': m.poll?.question ?? ''});
  } else if (m.attachment != null) {
    final caption = m.body.trim();
    body = caption.isNotEmpty
        ? caption
        : (m.attachment!.isImage
            ? t.t('group.preview.photo')
            : t.t('group.preview.file', {'name': m.attachment!.name}));
  } else {
    body = m.body.trim();
  }
  if (!withSender) return body;
  final who = m.mine ? t.t('group.you') : _name(t, m.sender);
  return '$who: $body';
}
