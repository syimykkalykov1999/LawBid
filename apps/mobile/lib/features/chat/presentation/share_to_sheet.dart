import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channel_widgets.dart'
    show ChannelAvatar;
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/post_share.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart'
    show CounterpartAvatar, counterpartName;
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_avatar.dart';
import 'package:lawbid/features/stories/application/stories_providers.dart';
import 'package:lawbid/features/stories/presentation/story_navigation.dart';
import 'package:lawbid/shared/people/people_suggest_list.dart';
import 'package:lawbid/shared/presentation/list_search_field.dart';
import 'package:lawbid/shared/presentation/share_sheet.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-21 (Instagram «Поделиться», inbox 17): the share sheet of
/// a post / reel. Search on top; «Чаты» (a grid of recent chats) and
/// «Сообщества» («Группы» where I can write, «Каналы» I run) — tap to pick,
/// several at once, an optional note and «Отправить»; with nothing picked,
/// a row of actions: the phone's share sheet, «Добавить в историю», «Копировать
/// ссылку» and the networks. Returns true when the post went somewhere (the
/// caller counts the share once).
Future<bool> showPostShareSheet(
  BuildContext context,
  WidgetRef ref, {
  required String postId,
  required String link,
  String? text,
}) async {
  final t = ref.read(translatorProvider);
  final targets = buildShareTargets(context, t: t, link: link, text: text);
  final picked = await showAppBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) =>
        ShareToSheet(postId: postId, link: link, targets: targets),
  );
  if (picked == null || !context.mounted) return false;
  if (picked == ShareToSheet.sent) return true;
  if (picked == 'copy') {
    await copyShareLink(context, t: t, link: link);
    return true;
  }
  if (picked == 'system') return shareLinkViaSystem(context, link: link);
  if (picked == 'story') {
    unawaited(openStoryCreator(context, postId: postId));
    return false;
  }
  return runShareTarget(
    context,
    t: t,
    target: targets.firstWhere((x) => x.key == picked),
  );
}

enum _Tab { chats, communities }

enum _Community { groups, channels }

/// One picked place: a chat, a group or a channel.
typedef _Pick = ({String kind, String id});

class ShareToSheet extends ConsumerStatefulWidget {
  const ShareToSheet({
    required this.postId,
    required this.link,
    required this.targets,
    super.key,
  });

  /// What the sheet pops with after «Отправить» went through.
  static const sent = 'sent';

  final String postId;
  final String link;
  final List<ShareTarget> targets;

  @override
  ConsumerState<ShareToSheet> createState() => _ShareToSheetState();
}

class _ShareToSheetState extends ConsumerState<ShareToSheet> {
  _Tab _tab = _Tab.chats;
  _Community _community = _Community.groups;
  String _q = '';
  final _picked = <_Pick>[];
  final _groups = <String, api.GroupDto>{};
  final _note = TextEditingController();
  bool _sending = false;

  /// One overscroll of the inner pages switches the outer tab once.
  bool _backFired = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  bool _isPicked(String kind, String id) =>
      _picked.any((p) => p.kind == kind && p.id == id);

  void _toggle(String kind, String id) {
    unawaited(HapticFeedback.selectionClick());
    setState(() {
      final i = _picked.indexWhere((p) => p.kind == kind && p.id == id);
      if (i >= 0) {
        _picked.removeAt(i);
      } else {
        _picked.add((kind: kind, id: id));
      }
    });
  }

  Future<void> _send() async {
    if (_picked.isEmpty || _sending) return;
    final t = ref.read(translatorProvider);
    final sender = ref.read(postShareSenderProvider);
    final note = _note.text.trim();
    setState(() => _sending = true);
    var ok = 0;
    Object? error;
    for (final p in List<_Pick>.of(_picked)) {
      try {
        switch (p.kind) {
          case 'chat':
            await sender.toChat(p.id, widget.postId, note: note);
          case 'person':
            // Found in the whole app: open (or start) our chat first.
            final conv =
                await ref.read(chatRepositoryProvider).startDirect(p.id);
            await sender.toChat(conv.id, widget.postId, note: note);
          case 'group':
            final g = _groups[p.id];
            if (g == null) continue;
            await sender.toGroup(g, widget.link, note: note);
          default:
            await sender.toChannel(p.id, widget.link, note: note);
        }
        ok++;
      } on Object catch (e) {
        error ??= e;
      }
    }
    if (!mounted) return;
    setState(() => _sending = false);
    if (ok > 0) ref.invalidate(conversationsProvider);
    final total = _picked.length;
    if (ok == 0) {
      showAppSnackBar(
        context,
        error == null ? t.t('share.to.failed') : errorText(t, error),
      );
      return;
    }
    unawaited(HapticFeedback.lightImpact());
    showAppSnackBar(
      context,
      ok == total
          ? t.t('share.to.sent')
          : t.t('share.to.partial', {
              'sent': context.digits('$ok'),
              'total': context.digits('$total'),
            }),
    );
    Navigator.of(context).pop(ShareToSheet.sent);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final mq = MediaQuery.of(context);
    final height = (mq.size.height - mq.padding.top) * 0.86;
    return Padding(
      padding: EdgeInsets.only(bottom: mq.viewInsets.bottom),
      child: SizedBox(
        height: height,
        child: SafeArea(
          top: false,
          child: Column(
            children: [
              const SizedBox(height: AppSpacing.sm),
              const AppSheetHandle(),
              ListSearchField(
                hintKey: 'share.to.search',
                fieldKey: const ValueKey('share-to-search'),
                onChanged: (v) => setState(() => _q = v),
              ),
              PillTabs<_Tab>(
                value: _tab,
                tabs: [
                  (_Tab.chats, t.t('share.to.chats')),
                  (_Tab.communities, t.t('share.to.communities')),
                ],
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  0,
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                ),
                onChanged: (v) => setState(() => _tab = v),
              ),
              Expanded(
                child: SwipePages<_Tab>(
                  value: _tab,
                  values: _Tab.values,
                  onChanged: (v) => setState(() => _tab = v),
                  pageBuilder: (context, tab) => switch (tab) {
                    _Tab.chats => _chatsGrid(t),
                    _Tab.communities => _communities(t),
                  },
                ),
              ),
              Divider(height: 1, thickness: 1, color: colors.border),
              // (AnimatedSize with a zero duration asserts: reduce
              // motion just swaps.)
              if (context.reduceMotion && _picked.isEmpty)
                _actions(t)
              else if (context.reduceMotion)
                _sendPanel(t)
              else
                AnimatedSize(
                  duration: AppMotion.stateChange,
                  alignment: Alignment.topCenter,
                  child: _picked.isEmpty ? _actions(t) : _sendPanel(t),
                ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Chats ──────────────────────────────────────────────────────────

  /// Recent chats I can write in: no closed, blocked, declined chats and
  /// no requests still waiting for an answer.
  static bool _canWrite(Conversation c) =>
      !c.closed &&
      !c.blockedHere &&
      c.request != MessageRequest.pending &&
      c.request != MessageRequest.declined;

  Widget _chatsGrid(Translator t) {
    final list = _q.isEmpty
        ? ref.watch(conversationsProvider)
        : ref.watch(
            searchConversationsProvider((folder: ChatListFolder.all, q: _q)),
          );
    final items = [
      for (final c in list.value?.items ?? const <Conversation>[])
        if (_canWrite(c)) c,
    ];
    // Owner 2026-10-21 (inbox 25b, Instagram): anyone in the app by name or
    // @username, under the matching chats.
    final searching = peopleSuggestQuery(_q).length >= peopleSuggestMinChars;
    if (list.isLoading && items.isEmpty && !searching) {
      return const Center(child: CircularProgressIndicator());
    }
    if (items.isEmpty && !searching) {
      return _Empty(t.t(_q.isEmpty ? 'share.to.noChats' : 'share.to.empty'));
    }
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final scaler = MediaQuery.textScalerOf(context);
    const avatar = 60.0;
    // Two lines of name under the avatar, at the reader's text size.
    // (+4: the line boxes round up.)
    final extent = avatar +
        AppSpacing.sm * 2 +
        6 +
        4 +
        2 * scaler.scale((type.caption.fontSize ?? 12) * 1.3);
    final grid = SliverGrid.builder(
      gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 96,
        mainAxisExtent: extent,
      ),
      itemCount: items.length,
      itemBuilder: (context, i) {
        final c = items[i];
        return _PickTile(
          key: ValueKey('share-to-chat-${c.id}'),
          name: counterpartName(t, c),
          picked: _isPicked('chat', c.id),
          avatarSize: avatar,
          avatar: CounterpartAvatar(
            counterpart: c.counterpart,
            size: avatar,
            online: false,
          ),
          onTap: () => _toggle('chat', c.id),
        );
      },
    );
    return CustomScrollView(
      key: const ValueKey('share-to-chats'),
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
          sliver: grid,
        ),
        if (searching)
          SliverToBoxAdapter(
            child: PeopleSuggestList(
              key: const ValueKey('share-to-people'),
              query: _q,
              scrollable: false,
              title: t.t('search.tab.people'),
              excludeIds: {
                for (final c in items)
                  if (c.counterpart.id != null) c.counterpart.id!,
              },
              selectedIds: {
                for (final p in _picked)
                  if (p.kind == 'person') p.id,
              },
              onPick: (p) => _toggle('person', p.id),
            ),
          ),
      ],
    );
  }

  // ── Communities ────────────────────────────────────────────────────

  Widget _communities(Translator t) => Column(
        children: [
          PillTabs<_Community>(
            value: _community,
            tabs: [
              (_Community.groups, t.t('share.to.groups')),
              (_Community.channels, t.t('share.to.channels')),
            ],
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              0,
              AppSpacing.screenSide,
              AppSpacing.xs,
            ),
            onChanged: (v) => setState(() => _community = v),
          ),
          Expanded(
            // Owner 2026-10-21: on «Группы», a swipe back goes on to
            // «Чаты» (the outer tab), like Instagram's nested tabs.
            child: NotificationListener<ScrollNotification>(
              onNotification: _innerScroll,
              child: SwipePages<_Community>(
                value: _community,
                values: _Community.values,
                onChanged: (v) => setState(() => _community = v),
                pageBuilder: (context, c) => switch (c) {
                  _Community.groups => _groupsList(t),
                  _Community.channels => _channelsList(t),
                },
              ),
            ),
          ),
        ],
      );

  bool _innerScroll(ScrollNotification n) {
    if (n.depth != 0 || n.metrics.axis != Axis.horizontal) return false;
    if (n is ScrollStartNotification) _backFired = false;
    final before = n is OverscrollNotification
        ? n.overscroll < 0
        : n.metrics.pixels < n.metrics.minScrollExtent - 24;
    if (!_backFired &&
        _community == _Community.groups &&
        before &&
        (n is OverscrollNotification || n is ScrollUpdateNotification)) {
      _backFired = true;
      setState(() => _tab = _Tab.chats);
    }
    return false;
  }

  Widget _groupsList(Translator t) {
    final list = ref.watch(groupsProvider);
    final q = _q.toLowerCase();
    final items = [
      for (final g in list.value?.items ?? const <api.GroupDto>[])
        if (g.canPost && (q.isEmpty || g.title.toLowerCase().contains(q))) g,
    ];
    for (final g in items) {
      _groups[g.id] = g;
    }
    if (list.isLoading && items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (items.isEmpty) {
      return _Empty(t.t(q.isEmpty ? 'share.to.noGroups' : 'share.to.empty'));
    }
    return ListView.builder(
      key: const ValueKey('share-to-groups'),
      itemCount: items.length,
      itemBuilder: (context, i) {
        final g = items[i];
        return _PickRow(
          key: ValueKey('share-to-group-${g.id}'),
          title: g.title,
          subtitle: g.username == null ? null : '@${g.username}',
          picked: _isPicked('group', g.id),
          avatar: GroupAvatar(name: g.title, url: g.avatarUrl, size: 44),
          onTap: () => _toggle('group', g.id),
        );
      },
    );
  }

  Widget _channelsList(Translator t) {
    final list = ref.watch(
      channelListProvider((scope: ChannelScope.managed, query: _q)),
    );
    final items = [
      for (final c in list.value ?? const <Channel>[])
        if (!c.isClosed) c,
    ];
    if (list.isLoading && items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (items.isEmpty) {
      return _Empty(
        t.t(_q.isEmpty ? 'share.to.noChannels' : 'share.to.empty'),
      );
    }
    return ListView.builder(
      key: const ValueKey('share-to-channels'),
      itemCount: items.length,
      itemBuilder: (context, i) {
        final c = items[i];
        return _PickRow(
          key: ValueKey('share-to-channel-${c.id}'),
          title: c.title,
          subtitle: '@${c.username}',
          picked: _isPicked('channel', c.id),
          avatar: ChannelAvatar(title: c.title, url: c.avatarUrl, size: 44),
          onTap: () => _toggle('channel', c.id),
        );
      },
    );
  }

  // ── Bottom ─────────────────────────────────────────────────────────

  Widget _actions(Translator t) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    Widget own(String key, IconData icon, String label) => _ActionTile(
          key: ValueKey('share-$key'),
          label: label,
          disc: colors.chip,
          icon: AppIcon(icon, color: colors.text),
          onTap: () => Navigator.of(context).pop(key),
        );
    final story = !kIsWeb && ref.watch(storiesEnabledProvider);
    final scaler = MediaQuery.textScalerOf(context);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final height = 52 +
        AppSpacing.sm * 2 +
        6 +
        4 +
        2 * scaler.scale((type.caption.fontSize ?? 12) * 1.3);
    return SizedBox(
      key: const ValueKey('share-to-actions'),
      height: height,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
        children: [
          own('system', AppIcons.iosShareRounded, t.t('share.to.system')),
          if (story) own('story', AppIcons.addRounded, t.t('share.to.story')),
          own('copy', AppIcons.linkRounded, t.t('share.to.copyLink')),
          for (final x in widget.targets)
            _ActionTile(
              key: ValueKey('share-${x.key}'),
              label: x.label,
              // A white disc keeps every brand logo legible in all themes
              // (as in the classic share sheet).
              disc: Colors.white,
              icon: x.icon,
              onTap: () => Navigator.of(context).pop(x.key),
            ),
        ],
      ),
    );
  }

  Widget _sendPanel(Translator t) => Padding(
        key: const ValueKey('share-to-send-panel'),
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.sm,
          AppSpacing.screenSide,
          AppSpacing.sm,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppTextField(
              key: const ValueKey('share-to-note'),
              controller: _note,
              hintText: t.t('share.to.note'),
              semanticLabel: t.t('share.to.note'),
              maxLength: 1000,
              textCapitalization: TextCapitalization.sentences,
              enabled: !_sending,
            ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              key: const ValueKey('share-to-send'),
              label: _picked.length > 1
                  ? '${t.t('share.to.send')} '
                      '(${context.digits('${_picked.length}')})'
                  : t.t('share.to.send'),
              icon: AppIcons.sendRounded,
              isLoading: _sending,
              onPressed: _send,
            ),
          ],
        ),
      );
}

/// A chat in the grid: the avatar (a ring and a tick when picked) and the
/// name under it.
class _PickTile extends StatelessWidget {
  const _PickTile({
    required this.name,
    required this.picked,
    required this.avatar,
    required this.avatarSize,
    required this.onTap,
    super.key,
  });

  final String name;
  final bool picked;
  final Widget avatar;
  final double avatarSize;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final motion = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    return Semantics(
      button: true,
      selected: picked,
      label: name,
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.card),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          child: Column(
            children: [
              SizedBox(
                width: avatarSize,
                height: avatarSize,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    AnimatedScale(
                      duration: motion,
                      scale: picked ? 0.86 : 1,
                      child: avatar,
                    ),
                    if (picked)
                      Positioned.fill(
                        child: IgnorePointer(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: colors.iconTint,
                                width: 2,
                              ),
                            ),
                          ),
                        ),
                      ),
                    if (picked)
                      const PositionedDirectional(
                        end: -2,
                        bottom: -2,
                        child: _Tick(size: 22),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 6),
              Text(
                name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: type.caption.copyWith(
                  color: colors.text,
                  fontWeight: picked ? FontWeight.w600 : FontWeight.w400,
                  height: 1.3,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The round tick of a picked place (the theme's tint, never gold).
class _Tick extends StatelessWidget {
  const _Tick({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: colors.iconTint,
        border: Border.all(color: colors.sheet, width: 2),
      ),
      child: AppIcon(AppIcons.checkRounded, size: size * 0.6, color: colors.bg),
    );
  }
}

/// A group or a channel: avatar, title, @username and the pick circle.
class _PickRow extends StatelessWidget {
  const _PickRow({
    required this.title,
    required this.picked,
    required this.avatar,
    required this.onTap,
    this.subtitle,
    super.key,
  });

  final String title;
  final String? subtitle;
  final bool picked;
  final Widget avatar;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      selected: picked,
      label: title,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenSide,
            vertical: AppSpacing.sm,
          ),
          child: Row(
            children: [
              avatar,
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (subtitle != null)
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              if (picked)
                const _Tick(size: 24)
              else
                Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: colors.border, width: 2),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One action of the bottom row: a disc with an icon, the label under it.
class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.label,
    required this.icon,
    required this.disc,
    required this.onTap,
    super.key,
  });

  final String label;
  final Widget icon;
  final Color disc;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return SizedBox(
      width: 76,
      child: Semantics(
        button: true,
        label: label,
        excludeSemantics: true,
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadii.card),
          onTap: () {
            unawaited(HapticFeedback.selectionClick());
            onTap();
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
            child: Column(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: disc,
                    shape: BoxShape.circle,
                    border: Border.all(color: colors.border),
                  ),
                  alignment: Alignment.center,
                  child: icon,
                ),
                const SizedBox(height: 6),
                Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: type.caption.copyWith(color: colors.text, height: 1.3),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: type.body.copyWith(color: colors.textSecondary),
        ),
      ),
    );
  }
}
