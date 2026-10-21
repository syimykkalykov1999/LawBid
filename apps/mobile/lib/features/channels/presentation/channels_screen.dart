import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/channels_routes.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channel_row_actions.dart';
import 'package:lawbid/features/channels/presentation/channel_widgets.dart';
import 'package:lawbid/features/channels/presentation/channels_groups.dart';
import 'package:lawbid/features/channels/presentation/community_archive.dart';
import 'package:lawbid/features/chat/application/chat_selection.dart';
import 'package:lawbid/features/chat/presentation/chat_selection_bar.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_chat_tile.dart';
import 'package:lawbid/shared/presentation/list_search_field.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20: the channels screen — the ones I run, the ones I
/// follow, and discover / search (title or @username).
class ChannelsScreen extends ConsumerStatefulWidget {
  const ChannelsScreen({super.key});

  @override
  ConsumerState<ChannelsScreen> createState() => _ChannelsScreenState();
}

class _ChannelsScreenState extends ConsumerState<ChannelsScreen> {
  static const _order = [
    ChannelScope.managed,
    ChannelScope.subscribed,
    ChannelScope.discover,
  ];

  ChannelScope _tab = ChannelScope.subscribed;
  String _query = '';
  bool _searchOpen = false;

  /// «Groups | Channels» of each list (a tab, or the search).
  final _kinds = <String, _Kind>{};
  String get _listKey => _query.isNotEmpty ? 'search' : _tab.name;
  late final _pages = PageController(initialPage: _order.indexOf(_tab));

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  /// Owner 2026-10-21: what is picked stays on the list in view — another
  /// tab, kind or search starts the picking over.
  void _clearPicked() => ref.read(chatSelectionProvider.notifier).clear();

  void _pick(ChannelScope v) {
    _clearPicked();
    setState(() => _tab = v);
    if (!_pages.hasClients) return;
    // Reduced motion: a jump (a zero-length animation asserts).
    if (context.reduceMotion) {
      _pages.jumpToPage(_order.indexOf(v));
      return;
    }
    unawaited(
      _pages.animateToPage(
        _order.indexOf(v),
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeOutCubic,
      ),
    );
  }

  void _typed(String raw) {
    // The hint shows «@username»; a typed or pasted «@» is dropped.
    _clearPicked();
    setState(() => _query = raw.trim().replaceFirst(RegExp('^@+'), ''));
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final searching = _query.isNotEmpty;
    final selection = ref.watch(chatSelectionProvider);
    final picks = selection == null ? null : _selectable();
    return ChannelsGate(
      child: PopScope(
        // Telegram: «back» first leaves the picking.
        canPop: selection == null,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) ref.read(chatSelectionProvider.notifier).stop();
        },
        child: Scaffold(
          backgroundColor: colors.bg,
          appBar: selection != null && picks != null
              ? _selectionBar(t, colors, selection, picks)
              : AppTopBar(
                  leading: AppBackButton(
                    semanticLabel: t.t('common.back'),
                    onPressed: () => context.canPop()
                        ? context.pop()
                        : Navigator.of(context).maybePop(),
                  ),
                  // Owner 2026-10-20: no word «Channels»: the tabs stand in
                  // the middle of the bar on the arrow's line, the magnifier
                  // and «+» at the right.
                  title: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 300),
                      child: PillTabs<ChannelScope>(
                        value: _tab,
                        tabs: [
                          (ChannelScope.managed, t.t('channel.tab.mine')),
                          (
                            ChannelScope.subscribed,
                            t.t('channel.tab.subscribed')
                          ),
                          (ChannelScope.discover, t.t('channel.tab.discover')),
                        ],
                        onChanged: _pick,
                      ),
                    ),
                  ),
                  actions: [
                    AppIconButton(
                      key: const ValueKey('channels-search-open'),
                      compact: true,
                      icon: AppIcon(
                        _searchOpen
                            ? AppIcons.closeRounded
                            : AppIcons.searchRounded,
                        size: 22,
                        color: colors.text,
                      ),
                      semanticLabel: t.t('channel.search.hint'),
                      onPressed: () => setState(() {
                        _searchOpen = !_searchOpen;
                        if (!_searchOpen) _query = '';
                      }),
                    ),
                    // Owner 2026-10-21 (п.24): «+» for every role — a
                    // group or a channel.
                    AppIconButton(
                      key: const ValueKey('channels-create'),
                      compact: true,
                      icon: AppIcon(AppIcons.addRounded, color: colors.text),
                      semanticLabel: t.t('channel.create'),
                      onPressed: () => _create(t),
                    ),
                  ],
                ),
          body: Column(
            children: [
              if (_searchOpen)
                ListSearchField(
                  fieldKey: const ValueKey('channels-search'),
                  hintKey: 'channel.search.hint',
                  initial: _query,
                  onChanged: _typed,
                ),
              Expanded(
                child: searching
                    ? _ScopeList(
                        scope: ChannelScope.discover,
                        query: _query,
                        empty: _empty(t, true, _tab),
                        kind: _kinds['search'] ?? _Kind.groups,
                        onKind: (k) => _kinds['search'] = k,
                        onClear: _clearPicked,
                      )
                    : PageView(
                        controller: _pages,
                        // Owner 2026-10-21: Mine · Following · Discover
                        // change by a tap only; the swipe belongs to
                        // Groups | Channels.
                        physics: const NeverScrollableScrollPhysics(),
                        onPageChanged: (i) => setState(() => _tab = _order[i]),
                        children: [
                          for (final scope in _order)
                            _ScopeList(
                              key: ValueKey('channels-page-${scope.name}'),
                              scope: scope,
                              query: '',
                              empty: _empty(t, false, scope),
                              kind: _kinds[scope.name] ?? _Kind.groups,
                              onKind: (k) => _kinds[scope.name] = k,
                              onClear: _clearPicked,
                            ),
                        ],
                      ),
              ),
            ],
          ),
          bottomNavigationBar: picks == null
              ? null
              : ChatSelectionBar(
                  chats: const [],
                  groups: picks.groups,
                  channels: picks.channels,
                ),
        ),
      ),
    );
  }

  /// The rows of the list in view that can be picked: my groups, or the
  /// channels I follow (a channel I do not follow has nothing to organize).
  ({List<api.GroupDto> groups, List<Channel> channels}) _selectable() {
    final searching = _query.isNotEmpty;
    final scope = searching ? ChannelScope.discover : _tab;
    final recommended = scope == ChannelScope.discover && !searching;
    if ((_kinds[_listKey] ?? _Kind.groups) == _Kind.groups) {
      final q = _query.toLowerCase();
      return (
        groups: recommended
            ? const <api.GroupDto>[]
            : [
                for (final g in ref.watch(groupsProvider).value?.items ??
                    const <api.GroupDto>[])
                  if (q.isEmpty || g.title.toLowerCase().contains(q)) g,
              ],
        channels: const <Channel>[],
      );
    }
    final channels = recommended
        ? ref.watch(recommendedChannelsProvider).value?.items
        : ref.watch(channelListProvider((scope: scope, query: _query))).value;
    return (
      groups: const <api.GroupDto>[],
      channels: [
        for (final c in channels ?? const <Channel>[])
          if (c.isSubscribed) c,
      ],
    );
  }

  /// Owner 2026-10-21 (Telegram): «Selected: N», «All» and «×» in the bar.
  PreferredSizeWidget _selectionBar(
    Translator t,
    AppColorTokens colors,
    Set<String> selection,
    ({List<api.GroupDto> groups, List<Channel> channels}) picks,
  ) {
    final ids = [
      for (final g in picks.groups) g.id,
      for (final c in picks.channels) c.id,
    ];
    final all = ids.isNotEmpty && ids.every(selection.contains);
    final notifier = ref.read(chatSelectionProvider.notifier);
    return AppTopBar(
      leading: AppIconButton(
        key: const ValueKey('select-cancel'),
        icon: AppIcon(AppIcons.closeRounded, color: colors.text),
        semanticLabel: t.t('common.cancel'),
        onPressed: notifier.stop,
      ),
      title: Text(
        t.t('chat.select.count', {'count': '${selection.length}'}),
        key: const ValueKey('select-count'),
      ),
      actions: [
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 108),
          child: TextButton(
            key: const ValueKey('select-all'),
            onPressed: () => all ? notifier.clear() : notifier.setAll(ids),
            child: Text(
              t.t(all ? 'chat.select.none' : 'chat.select.all'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ),
      ],
    );
  }

  /// Owner 2026-10-21 (п.22b): «+» makes a group or a channel.
  Future<void> _create(Translator t) async {
    final pick = await showAppBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: AppSpacing.sm),
            const AppSheetHandle(),
            AppListRow(
              key: const ValueKey('channels-new-group'),
              icon: AppIcons.groupAddOutlined,
              label: t.t('group.new'),
              showChevron: false,
              onTap: () => Navigator.of(ctx).pop('group'),
            ),
            AppListRow(
              key: const ValueKey('channels-new-channel'),
              icon: AppIcons.campaignOutlined,
              label: t.t('channel.create'),
              showChevron: false,
              onTap: () => Navigator.of(ctx).pop('channel'),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
    if (!mounted) return;
    switch (pick) {
      case 'group':
        unawaited(context.push(GroupRoutes.create));
      case 'channel':
        unawaited(context.push(ChannelsRoutes.newChannel));
    }
  }

  Widget _empty(
    Translator t,
    bool searching,
    ChannelScope tab,
  ) {
    if (searching) {
      return ChannelsEmpty(
        icon: AppIcons.searchOffRounded,
        message: t.t('channel.empty.search'),
      );
    }
    return switch (tab) {
      ChannelScope.managed => ChannelsEmpty(
          title: t.t('channel.empty.mine.title'),
          message: t.t('channel.empty.mine'),
          action: AppButton(
            label: t.t('channel.create'),
            onPressed: () => context.push(ChannelsRoutes.newChannel),
          ),
        ),
      ChannelScope.subscribed => ChannelsEmpty(
          title: t.t('channel.empty.subscribed.title'),
          message: t.t('channel.empty.subscribed'),
          action: AppButton(
            label: t.t('channel.tab.discover'),
            variant: AppButtonVariant.secondary,
            onPressed: () => _pick(ChannelScope.discover),
          ),
        ),
      _ => ChannelsEmpty(message: t.t('channel.empty.discover')),
    };
  }
}

enum _Kind { groups, channels }

/// One page of the channels screen: the groups and the channels of a scope
/// (or of a search). Owner 2026-10-21: groups live here, not in Chats; each
/// page has «Groups | Channels» on top (tap or swipe), no captions inside.
class _ScopeList extends ConsumerStatefulWidget {
  const _ScopeList({
    required this.scope,
    required this.query,
    required this.empty,
    required this.kind,
    required this.onKind,
    required this.onClear,
    super.key,
  });

  final ChannelScope scope;
  final String query;
  final Widget empty;

  /// «Groups | Channels» to start on, and where a change is told.
  final _Kind kind;
  final ValueChanged<_Kind> onKind;

  /// Drops what is picked (the list in view changed).
  final VoidCallback onClear;

  @override
  ConsumerState<_ScopeList> createState() => _ScopeListState();
}

class _ScopeListState extends ConsumerState<_ScopeList> {
  late _Kind _kind = widget.kind;
  late final _pages = PageController(initialPage: _kind.index);

  void _changed(_Kind v) {
    if (v != _kind) widget.onClear();
    widget.onKind(v);
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _pick(_Kind v) {
    _changed(v);
    setState(() => _kind = v);
    if (!_pages.hasClients) return;
    // Reduced motion: a jump (a zero-length animation asserts).
    if (context.reduceMotion) {
      _pages.jumpToPage(v.index);
      return;
    }
    unawaited(
      _pages.animateToPage(
        v.index,
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeOutCubic,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scope = widget.scope;
    final query = widget.query;
    final empty = widget.empty;
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final recommended = scope == ChannelScope.discover && query.isEmpty;
    final key = (scope: scope, query: query);
    final picking = ref.watch(chatSelectionProvider);
    final selection = ref.read(chatSelectionProvider.notifier);

    // Channels.
    final channels = recommended
        ? ref.watch(recommendedChannelsProvider).whenData((p) => p.items)
        : ref.watch(channelListProvider(key));

    // Owner 2026-10-21 (inbox 22d): what a row's menu offers by the tab.
    final groupMenu = scope == ChannelScope.subscribed
        ? GroupMenuSet.following
        : GroupMenuSet.full;
    final channelMenu = scope == ChannelScope.subscribed
        ? ChannelMenuSet.following
        : ChannelMenuSet.full;
    // Each section's own archive (inbox 22c): «Archive (N)» on top of the
    // Groups list and of the Channels list of Mine and Following.
    final withArchive = !recommended && query.isEmpty;
    final archivedGroups = withArchive
        ? ref.watch(archivedGroupsProvider).value?.items.length ?? 0
        : 0;
    final archivedChannels = withArchive
        ? ref.watch(archivedChannelsProvider).value?.length ?? 0
        : 0;

    // Groups: mine (Mine, Following), recommended (Discover), or the typed
    // words among mine and the public ones.
    final myGroups = ref.watch(groupsProvider);
    final List<Widget> groupRows;
    var groupsLoading = false;
    if (recommended) {
      final reco = ref.watch(recommendedGroupsProvider);
      groupsLoading = reco.isLoading && !reco.hasValue;
      groupRows = [
        for (final g
            in reco.value?.items ?? const <api.GroupInvitePreviewDto>[])
          GroupPreviewRow(key: ValueKey('group-reco-${g.id}'), group: g),
      ];
    } else if (query.isNotEmpty) {
      final q = query.toLowerCase();
      final mine = [
        for (final g in myGroups.value?.items ?? const <api.GroupDto>[])
          if (g.title.toLowerCase().contains(q)) g,
      ];
      final found = ref.watch(groupSearchProvider(query)).value ?? const [];
      groupRows = [
        for (final g in mine)
          GroupChatTile(
            key: ValueKey('group-row-${g.id}'),
            group: g,
            menu: groupMenu,
          ),
        for (final g in found)
          if (!mine.any((m) => m.id == g.id))
            GroupPreviewRow(key: ValueKey('group-found-${g.id}'), group: g),
      ];
    } else {
      groupsLoading = myGroups.isLoading && !myGroups.hasValue;
      groupRows = [
        for (final g in myGroups.value?.items ?? const <api.GroupDto>[])
          GroupChatTile(
            key: ValueKey('group-row-${g.id}'),
            group: g,
            menu: groupMenu,
          ),
      ];
    }

    final channelRows = channels.value ?? const <Channel>[];
    if (channels.hasError && channelRows.isEmpty && groupRows.isEmpty) {
      return CasesErrorView(
        error: channels.error!,
        t: t,
        onRetry: () => ref.invalidate(channelListProvider(key)),
      );
    }
    if ((channels.isLoading && !channels.hasValue || groupsLoading) &&
        channelRows.isEmpty &&
        groupRows.isEmpty) {
      return const CasesListSkeleton();
    }

    Future<void> refresh() async {
      ref.invalidate(channelListProvider(key));
      if (recommended) {
        await ref.read(recommendedChannelsProvider.notifier).refresh();
        await ref.read(recommendedGroupsProvider.notifier).refresh();
      } else {
        ref
          ..invalidate(archivedChannelsProvider)
          ..invalidate(archivedGroupsProvider);
        await ref.read(groupsProvider.notifier).refresh();
      }
    }

    // Discover never ends: the next pages of both lists come near the end.
    bool more(ScrollNotification n) {
      if (recommended && n.metrics.extentAfter < 400) {
        unawaited(ref.read(recommendedChannelsProvider.notifier).loadMore());
        unawaited(ref.read(recommendedGroupsProvider.notifier).loadMore());
      }
      return false;
    }

    final caption = Theme.of(context)
        .extension<AppTypographyTokens>()!
        .caption
        .copyWith(color: colors.textSecondary, fontWeight: FontWeight.w600);
    Widget list(_Kind kind, List<Widget> rows) => RefreshIndicator(
          color: colors.gold,
          backgroundColor: colors.sheet,
          onRefresh: refresh,
          child: NotificationListener<ScrollNotification>(
            onNotification: more,
            child: ListView(
              key: ValueKey('channels-list-${kind.name}'),
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
              children: [
                if (kind == _Kind.groups && archivedGroups > 0)
                  CommunityArchiveRow(count: archivedGroups, channels: false),
                if (kind == _Kind.channels && archivedChannels > 0)
                  CommunityArchiveRow(count: archivedChannels, channels: true),
                if (recommended && rows.isNotEmpty)
                  Padding(
                    padding: const EdgeInsetsDirectional.fromSTEB(
                      AppSpacing.screenSide,
                      AppSpacing.xs,
                      AppSpacing.screenSide,
                      AppSpacing.xs,
                    ),
                    child: Text(
                      t.t('reco.title'),
                      key: const ValueKey('channels-reco-title'),
                      style: caption,
                    ),
                  ),
                if (rows.isEmpty)
                  SizedBox(
                    height: 320,
                    child: kind == _Kind.channels
                        ? empty
                        : ChannelsEmpty(message: t.t('channel.empty.groups')),
                  )
                else
                  ...rows,
              ],
            ),
          ),
        );

    return Column(
      children: [
        PillTabs<_Kind>(
          key: const ValueKey('channels-kind'),
          value: _kind,
          tabs: [
            (_Kind.groups, t.t('channel.section.groups')),
            (_Kind.channels, t.t('channel.title')),
          ],
          onChanged: _pick,
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.xs,
            AppSpacing.screenSide,
            AppSpacing.xs,
          ),
        ),
        Expanded(
          child: PageView(
            controller: _pages,
            onPageChanged: (i) {
              _changed(_Kind.values[i]);
              setState(() => _kind = _Kind.values[i]);
            },
            children: [
              list(_Kind.groups, groupRows),
              list(_Kind.channels, [
                for (final c in channelRows)
                  ChannelRow(
                    key: ValueKey('channel-row-${c.id}'),
                    channel: c,
                    // Owner 2026-10-21: a channel I follow is picked like a
                    // chat (its menu's «Select», then taps).
                    picked: picking == null || !c.isSubscribed
                        ? null
                        : picking.contains(c.id),
                    onTap: picking != null && c.isSubscribed
                        ? () => selection.toggle(c.id)
                        : () => context.push(ChannelsRoutes.channel(c.id)),
                    // Inbox 22d: the long press opens the row's actions by
                    // the tab (Discover: subscribe · open).
                    onLongPress: picking == null
                        ? () => showChannelOrganizeSheet(
                              context,
                              ref,
                              c,
                              menu: channelMenu,
                            )
                        : null,
                  ),
              ]),
            ],
          ),
        ),
      ],
    );
  }
}
