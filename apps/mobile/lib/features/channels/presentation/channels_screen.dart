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
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:lawbid/shared/presentation/chips_search_row.dart';

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
          title: Text(t.t('channel.title')),
          actions: [
            if (canCreate)
              AppIconButton(
                key: const ValueKey('channels-create'),
                icon: AppIcon(AppIcons.addRounded, color: colors.text),
                semanticLabel: t.t('channel.create'),
                onPressed: () => context.push(ChannelsRoutes.newChannel),
              ),
          ],
        ),
        body: Column(
          children: [
            // Owner 2026-10-20: the tabs and a round magnifier in one row.
            ChipsSearchRow(
              chips: Padding(
                padding: const EdgeInsetsDirectional.only(
                  start: AppSpacing.sm,
                ),
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
              hintKey: 'channel.search.hint',
              query: _query,
              onQuery: _typed,
              openKey: const ValueKey('channels-search-open'),
              fieldKey: const ValueKey('channels-search'),
              closeKey: const ValueKey('channels-search-close'),
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

/// One page of the channels screen: the list of a scope (or of a search).
class _ScopeList extends ConsumerWidget {
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
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final key = (scope: scope, query: query);
    final list = ref.watch(channelListProvider(key));

    Future<void> refresh() async {
      ref.invalidate(channelListProvider(key));
      await ref.read(channelListProvider(key).future);
    }

    return switch (list) {
      AsyncData(:final value) when value.isEmpty => empty,
      AsyncData(:final value) => RefreshIndicator(
          color: colors.gold,
          backgroundColor: colors.sheet,
          onRefresh: refresh,
          child: ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(
              top: AppSpacing.sm,
              bottom: AppSpacing.xxl,
            ),
            itemCount: value.length,
            separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.xs),
            itemBuilder: (context, i) => ChannelRow(
              key: ValueKey('channel-row-${value[i].id}'),
              channel: value[i],
              onTap: () => context.push(ChannelsRoutes.channel(value[i].id)),
            ),
          ),
        ),
      AsyncError(:final error) => CasesErrorView(
          error: error,
          t: t,
          onRetry: () => ref.invalidate(channelListProvider(key)),
        ),
      _ => const CasesListSkeleton(),
    };
  }
}
