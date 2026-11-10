import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart'
    show GoldRingAvatar;
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The name shown for a poll participant.
String pollPersonName(Translator t, api.GroupPersonDto p) {
  final name = p.displayName?.trim();
  if (name != null && name.isNotEmpty) return name;
  final handle = p.username?.trim();
  if (handle != null && handle.isNotEmpty) return '@$handle';
  return t.t('group.someone');
}

/// A small round avatar of a poll participant.
class PollPersonAvatar extends StatelessWidget {
  const PollPersonAvatar({
    required this.person,
    required this.name,
    required this.size,
    super.key,
  });

  final api.GroupPersonDto person;
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) => GoldRingAvatar(
        url: person.avatarUrl,
        initials: avatarInitials(name),
        size: size,
      );
}

/// Opens the «Who voted» sheet of a non-anonymous poll.
Future<void> showPollVotersSheet(
  BuildContext context, {
  required String groupId,
  required api.PollDto poll,
}) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _VotersSheet(groupId: groupId, poll: poll),
    );

class _VotersSheet extends ConsumerStatefulWidget {
  const _VotersSheet({required this.groupId, required this.poll});

  final String groupId;
  final api.PollDto poll;

  @override
  ConsumerState<_VotersSheet> createState() => _VotersSheetState();
}

class _VotersSheetState extends ConsumerState<_VotersSheet> {
  List<api.PollVoterOptionDto>? _data;
  Object? _error;
  bool _loading = true;

  /// Sweep B-c1: the first list holds up to 50 voters per option; the rest
  /// of an option come page by page when its list scrolls to the end.
  final Map<String, List<api.GroupPersonDto>> _more = {};
  final Map<String, String?> _next = {};
  final Set<String> _loadingMore = {};

  void _loadMore(String optionId, int shown) {
    if (_loadingMore.contains(optionId)) return;
    if (_next.containsKey(optionId) && _next[optionId] == null) return;
    _loadingMore.add(optionId);
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        final cursor = _next[optionId];
        // The first extra page starts from the top (the 50 shown come
        // again and are skipped), later ones from the server's cursor.
        final page = await ref.read(groupRepositoryProvider).optionVoters(
              widget.groupId,
              widget.poll.id,
              optionId,
              cursor: cursor,
              limit: cursor == null ? shown + 50 : 50,
            );
        if (!mounted) return;
        setState(() {
          _more.putIfAbsent(optionId, () => []).addAll(page.items);
          _next[optionId] = page.nextCursor;
        });
      } on Object {
        // The next scroll to the end tries again.
      } finally {
        _loadingMore.remove(optionId);
      }
    });
  }

  List<api.GroupPersonDto> _votersOf(
    String optionId,
    List<api.GroupPersonDto> first,
  ) {
    final more = _more[optionId];
    if (more == null || more.isEmpty) return first;
    final seen = <String>{};
    return [
      for (final p in [...first, ...more])
        if (seen.add(p.userId)) p,
    ];
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ref
          .read(groupRepositoryProvider)
          .voters(widget.groupId, widget.poll.id);
      if (!mounted) return;
      setState(() {
        _data = data;
        _loading = false;
      });
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final height = MediaQuery.sizeOf(context).height * 0.8;
    return SafeArea(
      child: SizedBox(
        height: height,
        child: Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            0,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const AppSheetHandle(),
              Text(
                t.t('poll.votersTitle'),
                style: typography.titleMedium.copyWith(color: colors.text),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                widget.poll.question,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: typography.bodySmall.copyWith(
                  color: colors.textSecondary,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Expanded(child: _body(t, colors, typography)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _body(
    Translator t,
    AppColorTokens colors,
    AppTypographyTokens typography,
  ) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    final error = _error;
    if (error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              errorText(t, error),
              textAlign: TextAlign.center,
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: t.t('common.retry'),
              variant: AppButtonVariant.secondary,
              onPressed: _load,
            ),
          ],
        ),
      );
    }
    final byOption = {
      for (final o in _data ?? const <api.PollVoterOptionDto>[])
        o.optionId: o.voters,
    };
    // Sweep B-c1: one lazy list of rows (header, voters, divider per
    // option), so only what is on screen is built; the last row of an
    // option with more votes asks for the next page.
    final rows = <Widget Function()>[];
    for (final option in widget.poll.options) {
      final voters = _votersOf(
        option.id,
        byOption[option.id] ?? const <api.GroupPersonDto>[],
      );
      final total = option.votes.toInt() > voters.length
          ? option.votes.toInt()
          : voters.length;
      rows.add(
        () => _OptionHeader(title: option.text, count: total),
      );
      if (voters.isEmpty) {
        rows.add(() => _NoVotes(t: t));
      }
      for (var i = 0; i < voters.length; i++) {
        final p = voters[i];
        final last = i == voters.length - 1;
        rows.add(() {
          if (last && voters.length < total) {
            _loadMore(option.id, voters.length);
          }
          return _VoterRow(person: p, t: t);
        });
      }
      rows.add(() => Divider(height: AppSpacing.xl, color: colors.border));
    }
    return ListView.builder(
      padding: const EdgeInsets.only(bottom: AppSpacing.xl),
      itemCount: rows.length,
      itemBuilder: (context, i) => rows[i](),
    );
  }
}

class _OptionHeader extends StatelessWidget {
  const _OptionHeader({required this.title, required this.count});

  final String title;
  final int count;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: typography.body.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(
            context.digits(count),
            style: typography.bodySmall.copyWith(
              color: colors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _NoVotes extends StatelessWidget {
  const _NoVotes({required this.t});

  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Text(
        t.t('poll.noVotes'),
        style: typography.bodySmall.copyWith(color: colors.textSecondary),
      ),
    );
  }
}

class _VoterRow extends StatelessWidget {
  const _VoterRow({required this.person, required this.t});

  final api.GroupPersonDto person;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final name = pollPersonName(t, person);
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
      child: Row(
        children: [
          PollPersonAvatar(person: person, name: name, size: 34),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: typography.body.copyWith(color: colors.text),
            ),
          ),
        ],
      ),
    );
  }
}
