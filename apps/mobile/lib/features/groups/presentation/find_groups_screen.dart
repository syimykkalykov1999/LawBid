import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_avatar.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The server needs at least this many characters to search.
const _minQuery = 2;

/// «Find groups»: a search over public groups (title or @username), with a
/// Join / Open button on every row.
class FindGroupsScreen extends ConsumerStatefulWidget {
  const FindGroupsScreen({super.key});

  @override
  ConsumerState<FindGroupsScreen> createState() => _FindGroupsScreenState();
}

class _FindGroupsScreenState extends ConsumerState<FindGroupsScreen> {
  final _text = TextEditingController();
  Timer? _debounce;

  /// The query whose answer is on screen (or loading); '' = nothing typed.
  String _query = '';
  AsyncValue<List<api.GroupInvitePreviewDto>>? _results;

  /// Group ids with a join in flight / a request sent from this screen.
  final _joining = <String>{};
  final _requested = <String>{};

  @override
  void dispose() {
    _debounce?.cancel();
    _text.dispose();
    super.dispose();
  }

  void _onChanged(String raw) {
    _debounce?.cancel();
    final q = raw.trim().replaceFirst(RegExp('^@'), '');
    if (q.length < _minQuery) {
      setState(() {
        _query = q;
        _results = null;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 400), () => _search(q));
  }

  Future<void> _search(String q) async {
    setState(() {
      _query = q;
      _results = const AsyncLoading();
    });
    final next = await AsyncValue.guard(
      () => ref.read(groupRepositoryProvider).searchPublic(q),
    );
    // A newer query took over while this one was loading.
    if (!mounted || _query != q) return;
    setState(() => _results = next);
  }

  Future<void> _join(Translator t, api.GroupInvitePreviewDto g) async {
    if (_joining.contains(g.id)) return;
    setState(() => _joining.add(g.id));
    try {
      final result = await ref.read(groupRepositoryProvider).join(g.code);
      ref.read(groupsProvider.notifier).catchUp();
      if (!mounted) return;
      if (result.status == api.GroupJoinResultDtoStatus.joined) {
        setState(() => _joining.remove(g.id));
        unawaited(context.push(GroupRoutes.group(result.groupId)));
      } else {
        setState(() {
          _joining.remove(g.id);
          _requested.add(g.id);
        });
      }
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _joining.remove(g.id));
      showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('group.find.title')),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                AppSpacing.sm,
                AppSpacing.screenSide,
                AppSpacing.sm,
              ),
              child: AppTextField(
                key: const ValueKey('find-search'),
                controller: _text,
                hintText: t.t('group.find.hint'),
                semanticLabel: t.t('group.find.hint'),
                textInputAction: TextInputAction.search,
                leading: Text(
                  '@',
                  style: TextStyle(color: colors.textSecondary),
                ),
                onChanged: _onChanged,
                onSubmitted: (v) {
                  _debounce?.cancel();
                  final q = v.trim().replaceFirst(RegExp('^@'), '');
                  if (q.length >= _minQuery) unawaited(_search(q));
                },
              ),
            ),
            Expanded(child: _body(t)),
          ],
        ),
      ),
    );
  }

  Widget _rowOf(Translator t, api.GroupInvitePreviewDto g, String tag) =>
      _GroupRow(
        key: ValueKey('$tag-${g.id}'),
        group: g,
        t: t,
        joining: _joining.contains(g.id),
        requested: _requested.contains(g.id) || g.requestPending,
        onOpen: () => context.push(
          g.alreadyMember ? GroupRoutes.group(g.id) : GroupRoutes.join(g.code),
        ),
        onJoin: () => _join(t, g),
      );

  /// Nothing typed: the «Recommended» section (ranked for me, paged).
  Widget _recommended(Translator t) {
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final notifier = ref.read(recommendedGroupsProvider.notifier);
    return PagedListBody<api.GroupInvitePreviewDto>(
      value: ref.watch(recommendedGroupsProvider),
      t: t,
      itemKey: (g) => g.id,
      itemBuilder: (context, g, _) => _rowOf(t, g, 'reco'),
      skeleton: const CasesListSkeleton(),
      header: Text(
        t.t('reco.title'),
        key: const ValueKey('reco-title'),
        style: typography.caption.copyWith(
          color: colors.textSecondary,
          fontWeight: FontWeight.w600,
        ),
      ),
      empty: AppEmptyState(
        icon: AppIcons.searchRounded,
        message: t.t('group.find.initial'),
      ),
      onRefresh: notifier.refresh,
      onLoadMore: () => unawaited(notifier.loadMore()),
      onRetryMore: () => unawaited(notifier.retryLoadMore()),
    );
  }

  Widget _body(Translator t) {
    final results = _results;
    if (results == null && _query.isEmpty) return _recommended(t);
    if (results == null) {
      return AppEmptyState(
        icon: AppIcons.searchRounded,
        message: t.t(
          _query.isEmpty ? 'group.find.initial' : 'group.find.short',
        ),
      );
    }
    return switch (results) {
      AsyncData(:final value) when value.isEmpty => AppEmptyState(
          icon: AppIcons.searchOffRounded,
          message: t.t('group.find.empty', {'query': _query}),
        ),
      AsyncData(:final value) => ListView.builder(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          itemCount: value.length,
          itemBuilder: (context, i) {
            return _rowOf(t, value[i], 'found');
          },
        ),
      AsyncError(:final error) => CasesErrorView(
          error: error,
          t: t,
          onRetry: () => _search(_query),
        ),
      _ => const CasesListSkeleton(),
    };
  }
}

class _GroupRow extends StatelessWidget {
  const _GroupRow({
    required this.group,
    required this.t,
    required this.joining,
    required this.requested,
    required this.onOpen,
    required this.onJoin,
    super.key,
  });

  final api.GroupInvitePreviewDto group;
  final Translator t;
  final bool joining;
  final bool requested;
  final VoidCallback onOpen;
  final VoidCallback onJoin;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final username = group.username;
    final label = group.alreadyMember
        ? t.t('group.find.open')
        : requested
            ? t.t('group.find.requested')
            : group.requiresApproval
                ? t.t('group.find.request')
                : t.t('group.find.join');
    return InkWell(
      onTap: onOpen,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 64),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenSide,
            vertical: AppSpacing.sm,
          ),
          child: Row(
            children: [
              GroupAvatar(
                name: group.title,
                url: group.avatarUrl,
                size: AppSizes.rowMedallion + AppSpacing.sm,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      group.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: typography.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      [
                        if (username != null) '@$username',
                        if ((group.mutualCount ?? 0) > 0)
                          t.t(
                            'reco.mutual',
                            {
                              'count': context.digits(
                                group.mutualCount!.toInt(),
                              ),
                            },
                          ),
                        t.t(
                          'group.find.members',
                          {'count': context.digits(group.memberCount.toInt())},
                        ),
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: typography.caption.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: MediaQuery.sizeOf(context).width * 0.34,
                ),
                child: AppButton(
                  key: ValueKey('found-btn-${group.id}'),
                  label: label,
                  height: AppSizes.touchTarget,
                  variant: group.alreadyMember || requested
                      ? AppButtonVariant.secondary
                      : AppButtonVariant.primary,
                  isLoading: joining,
                  isEnabled: !requested || group.alreadyMember,
                  onPressed: group.alreadyMember ? onOpen : onJoin,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
