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
import 'package:lawbid/features/channels/presentation/channel_widgets.dart';
import 'package:lawbid/features/channels/presentation/channels_groups.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_chat_tile.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';
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
  late final _pages = PageController(initialPage: _order.indexOf(_tab));

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _pick(ChannelScope v) {
    setState(() => _tab = v);
    if (!_pages.hasClients) return;
    final motion = context.reduceMotion
        ? Duration.zero
        : const Duration(milliseconds: 260);
    unawaited(
      _pages.animateToPage(
        _order.indexOf(v),
        duration: motion,
        curve: Curves.easeOutCubic,
      ),
    );
  }

  void _typed(String raw) {
    // The hint shows «@username»; a typed or pasted «@» is dropped.
    setState(() => _query = raw.trim().replaceFirst(RegExp('^@+'), ''));
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final canCreate = ref.watch(currentUserRoleProvider) == UserRole.attorney;
    final searching = _query.isNotEmpty;
    return ChannelsGate(
      child: Scaffold(
        backgroundColor: colors.bg,
        appBar: AppTopBar(
          leading: AppBackButton(
            semanticLabel: t.t('common.back'),
            onPressed: () => context.canPop()
                ? context.pop()
                : Navigator.of(context).maybePop(),
          ),
          // Owner 2026-10-20: no word «Channels»: the tabs stand in the middle
          // of the bar on the arrow's line, the magnifier and «+» at the right.
          title: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 300),
              child: PillTabs<ChannelScope>(
                value: _tab,
                tabs: [
                  (ChannelScope.managed, t.t('channel.tab.mine')),
                  (ChannelScope.subscribed, t.t('channel.tab.subscribed')),
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
                _searchOpen ? AppIcons.closeRounded : AppIcons.searchRounded,
                size: 22,
                color: colors.text,
              ),
              semanticLabel: t.t('channel.search.hint'),
              onPressed: () => setState(() {
                _searchOpen = !_searchOpen;
                if (!_searchOpen) _query = '';
              }),
            ),
            if (canCreate)
              AppIconButton(
                key: const ValueKey('channels-create'),
                compact: true,
                icon: AppIcon(AppIcons.addRounded, color: colors.text),
                semanticLabel: t.t('channel.create'),
                onPressed: () => context.push(ChannelsRoutes.newChannel),
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
                      empty: _empty(t, true, canCreate, _tab),
                    )
                  : PageView(
                      controller: _pages,
                      // Owner 2026-10-21: Mine · Following · Discover change
                      // by a tap only; the swipe belongs to Groups | Channels.
                      physics: const NeverScrollableScrollPhysics(),
                      onPageChanged: (i) => setState(() => _tab = _order[i]),
                      children: [
                        for (final scope in _order)
                          _ScopeList(
                            key: ValueKey('channels-page-${scope.name}'),
                            scope: scope,
                            query: '',
                            empty: _empty(t, false, canCreate, scope),
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _empty(
    Translator t,
    bool searching,
    bool canCreate,
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
          action: canCreate
              ? AppButton(
                  label: t.t('channel.create'),
                  onPressed: () => context.push(ChannelsRoutes.newChannel),
                )
              : null,
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
    super.key,
  });

  final ChannelScope scope;
  final String query;
  final Widget empty;

  @override
  ConsumerState<_ScopeList> createState() => _ScopeListState();
}

class _ScopeListState extends ConsumerState<_ScopeList> {
  _Kind _kind = _Kind.groups;
  final _pages = PageController();

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _pick(_Kind v) {
    setState(() => _kind = v);
    if (!_pages.hasClients) return;
    final motion = context.reduceMotion
        ? Duration.zero
        : const Duration(milliseconds: 260);
    unawaited(
      _pages.animateToPage(
        v.index,
        duration: motion,
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

    // Channels.
    final channels = recommended
        ? ref.watch(recommendedChannelsProvider).whenData((p) => p.items)
        : ref.watch(channelListProvider(key));

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
          GroupChatTile(key: ValueKey('group-row-${g.id}'), group: g),
        for (final g in found)
          if (!mine.any((m) => m.id == g.id))
            GroupPreviewRow(key: ValueKey('group-found-${g.id}'), group: g),
      ];
    } else {
      groupsLoading = myGroups.isLoading && !myGroups.hasValue;
      groupRows = [
        for (final g in myGroups.value?.items ?? const <api.GroupDto>[])
          GroupChatTile(key: ValueKey('group-row-${g.id}'), group: g),
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
            onPageChanged: (i) => setState(() => _kind = _Kind.values[i]),
            children: [
              list(_Kind.groups, groupRows),
              list(_Kind.channels, [
                for (final c in channelRows)
                  ChannelRow(
                    key: ValueKey('channel-row-${c.id}'),
                    channel: c,
                    onTap: () => context.push(ChannelsRoutes.channel(c.id)),
                  ),
              ]),
            ],
          ),
        ),
      ],
    );
  }
}
