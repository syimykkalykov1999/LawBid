import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
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
    return ListView(
      padding: const EdgeInsets.only(bottom: AppSpacing.xl),
      children: [
        for (final option in widget.poll.options)
          _OptionSection(
            title: option.text,
            voters: byOption[option.id] ?? const <api.GroupPersonDto>[],
            t: t,
          ),
      ],
    );
  }
}

class _OptionSection extends StatelessWidget {
  const _OptionSection({
    required this.title,
    required this.voters,
    required this.t,
  });

  final String title;
  final List<api.GroupPersonDto> voters;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
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
                '${voters.length}',
                style: typography.bodySmall.copyWith(
                  color: colors.textSecondary,
                ),
              ),
            ],
          ),
        ),
        if (voters.isEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: Text(
              t.t('poll.noVotes'),
              style: typography.bodySmall.copyWith(
                color: colors.textSecondary,
              ),
            ),
          )
        else
          for (final p in voters) _VoterRow(person: p, t: t),
        Divider(height: AppSpacing.xl, color: colors.border),
      ],
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
