import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/poll/poll_logic.dart';
import 'package:lawbid/features/groups/presentation/poll/poll_voters_sheet.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The poll inside a chat bubble: question, options with live results,
/// vote / retract / close / who-voted actions. Draws the card content only.
class PollBubble extends ConsumerStatefulWidget {
  const PollBubble({
    required this.groupId,
    required this.message,
    required this.canClose,
    this.onPollChanged,
    super.key,
  });

  final String groupId;
  final api.GroupMessageDto message;
  final bool canClose;

  /// Called with the fresh poll after my own vote / close, so the chat
  /// list can keep it.
  final void Function(api.PollDto poll)? onPollChanged;

  @override
  ConsumerState<PollBubble> createState() => _PollBubbleState();
}

class _PollBubbleState extends ConsumerState<PollBubble> {
  /// What I know newer than the parent's copy (optimistic or the server's
  /// answer); dropped as soon as the parent hands down a different poll.
  api.PollDto? _local;

  /// Unsent choice of a multiple-choice poll.
  Set<String>? _draft;
  bool _busy = false;

  api.PollDto? get _poll => _local ?? widget.message.poll;

  @override
  void didUpdateWidget(PollBubble old) {
    super.didUpdateWidget(old);
    if (!identical(old.message.poll, widget.message.poll) && !_busy) {
      _local = null;
      _draft = null;
    }
  }

  Set<String> _selection(api.PollDto poll) =>
      _draft ?? poll.myOptionIds.toSet();

  Future<void> _vote(Set<String> choice) async {
    final poll = _poll;
    if (poll == null || _busy) return;
    final t = ref.read(translatorProvider);
    final repo = ref.read(groupRepositoryProvider);
    final before = _local;
    setState(() {
      _busy = true;
      _local = pollWithVote(poll, choice);
      _draft = null;
    });
    try {
      final fresh = await repo.vote(widget.groupId, poll.id, choice.toList());
      if (!mounted) return;
      setState(() {
        _local = fresh;
        _busy = false;
      });
      widget.onPollChanged?.call(fresh);
    } on Object catch (e) {
      if (!mounted) return;
      final closed = e is ApiException && e.code == ApiErrorCodes.pollClosed;
      final next = closed ? pollAsClosed(poll) : null;
      setState(() {
        _local = next ?? before;
        _busy = false;
      });
      if (next != null) widget.onPollChanged?.call(next);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  void _onOptionTap(api.PollDto poll, String optionId) {
    if (poll.closed || _busy) return;
    if (poll.multiple) {
      setState(() {
        _draft = pollToggle(
          _selection(poll),
          optionId,
          multiple: true,
        );
      });
      return;
    }
    if (poll.myOptionIds.length == 1 && poll.myOptionIds.first == optionId) {
      return;
    }
    _vote({optionId});
  }

  Future<void> _close(api.PollDto poll) async {
    final t = ref.read(translatorProvider);
    final repo = ref.read(groupRepositoryProvider);
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('poll.close.title'),
      message: t.t('poll.close.message'),
      confirmLabel: t.t('poll.close'),
      destructive: true,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      final fresh = await repo.closePoll(widget.groupId, poll.id);
      if (!mounted) return;
      setState(() {
        _local = fresh;
        _draft = null;
        _busy = false;
      });
      widget.onPollChanged?.call(fresh);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final poll = _poll;
    if (poll == null) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final selection = _selection(poll);
    final showResults = pollShowsResults(poll);
    final voted = poll.myOptionIds.isNotEmpty;
    final changed = !pollSameSelection(selection, poll.myOptionIds);
    final subtitle = [
      t.t(poll.anonymous ? 'poll.anonymous' : 'poll.public'),
      if (poll.multiple) t.t('poll.multiple'),
      if (poll.closed) t.t('poll.closed'),
    ].join(' · ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          poll.question,
          style: typography.body.copyWith(
            color: colors.text,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          subtitle,
          style: typography.caption.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.sm),
        for (final option in poll.options)
          _OptionRow(
            option: option,
            multiple: poll.multiple,
            selected: selection.contains(option.id),
            showResults: showResults,
            showVoters: !poll.anonymous && showResults,
            enabled: !poll.closed && !_busy,
            t: t,
            onTap: () => _onOptionTap(poll, option.id),
          ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          t.plural('poll.voters', poll.totalVoters),
          style: typography.caption.copyWith(color: colors.textSecondary),
        ),
        if (poll.multiple && !poll.closed && changed && selection.isNotEmpty)
          _ActionButton(
            label: t.t('poll.vote'),
            filled: true,
            busy: _busy,
            onTap: () => _vote(selection),
          ),
        if (voted && !poll.closed)
          _ActionButton(
            label: t.t('poll.retract'),
            onTap: _busy ? null : () => _vote(const {}),
          ),
        if (!poll.anonymous)
          _ActionButton(
            label: t.t('poll.viewVotes'),
            onTap: () => showPollVotersSheet(
              context,
              groupId: widget.groupId,
              poll: poll,
            ),
          ),
        if (widget.canClose && !poll.closed)
          _ActionButton(
            label: t.t('poll.close'),
            danger: true,
            onTap: _busy ? null : () => _close(poll),
          ),
      ],
    );
  }
}

class _OptionRow extends StatelessWidget {
  const _OptionRow({
    required this.option,
    required this.multiple,
    required this.selected,
    required this.showResults,
    required this.showVoters,
    required this.enabled,
    required this.t,
    required this.onTap,
  });

  final api.PollOptionDto option;
  final bool multiple;
  final bool selected;
  final bool showResults;
  final bool showVoters;
  final bool enabled;
  final Translator t;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final chat = ChatColors.of(context);
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final percent = option.percent.toDouble().clamp(0, 100);
    final voters = showVoters
        ? option.recentVoters.take(3).toList()
        : const <api.GroupPersonDto>[];
    final label = showResults
        ? '${option.text}, '
            '${t.t('poll.percentOfVotes', {
                'percent': '${percent.round()}',
                'votes': '${option.votes.toInt()}',
              })}'
        : option.text;
    return Semantics(
      container: true,
      button: enabled,
      inMutuallyExclusiveGroup: !multiple,
      checked: selected,
      label: label,
      onTap: enabled ? onTap : null,
      excludeSemantics: true,
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(AppRadii.button),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: _Marker(
                    multiple: multiple,
                    selected: selected,
                    color: chat.tickRead,
                    border: colors.textSecondary,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Text(
                              option.text,
                              style: typography.body.copyWith(
                                color: colors.text,
                              ),
                            ),
                          ),
                          if (showResults) ...[
                            const SizedBox(width: AppSpacing.sm),
                            Text(
                              '${percent.round()}%',
                              style: typography.bodySmall.copyWith(
                                color: colors.text,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ],
                      ),
                      if (showResults) ...[
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Expanded(
                              child: _Bar(
                                fraction: percent / 100,
                                color: chat.tickRead,
                                track: colors.textSecondary.withValues(
                                  alpha: 0.18,
                                ),
                              ),
                            ),
                            const SizedBox(width: AppSpacing.sm),
                            Text(
                              '${option.votes.toInt()}',
                              style: typography.caption.copyWith(
                                color: colors.textSecondary,
                              ),
                            ),
                            if (voters.isNotEmpty) ...[
                              const SizedBox(width: AppSpacing.xs),
                              _VoterStack(voters: voters, t: t),
                            ],
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Marker extends StatelessWidget {
  const _Marker({
    required this.multiple,
    required this.selected,
    required this.color,
    required this.border,
  });

  final bool multiple;
  final bool selected;
  final Color color;
  final Color border;

  @override
  Widget build(BuildContext context) {
    const size = 20.0;
    return AnimatedContainer(
      duration: AppMotion.stateChange,
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: multiple ? BoxShape.rectangle : BoxShape.circle,
        borderRadius: multiple ? BorderRadius.circular(5) : null,
        color: selected ? color : Colors.transparent,
        border: Border.all(color: selected ? color : border, width: 1.5),
      ),
      child: selected
          ? const Icon(AppIcons.check, size: 14, color: Colors.white)
          : null,
    );
  }
}

class _Bar extends StatelessWidget {
  const _Bar({
    required this.fraction,
    required this.color,
    required this.track,
  });

  final double fraction;
  final Color color;
  final Color track;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(AppRadii.pill),
        child: SizedBox(
          height: 6,
          child: ColoredBox(
            color: track,
            child: TweenAnimationBuilder<double>(
              tween: Tween(end: fraction),
              duration: AppMotion.stepSwitch,
              curve: AppMotion.enterCurve,
              builder: (context, value, _) => Align(
                alignment: AlignmentDirectional.centerStart,
                child: FractionallySizedBox(
                  widthFactor: value,
                  heightFactor: 1,
                  child: ColoredBox(color: color),
                ),
              ),
            ),
          ),
        ),
      );
}

class _VoterStack extends StatelessWidget {
  const _VoterStack({required this.voters, required this.t});

  final List<api.GroupPersonDto> voters;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    const size = 16.0;
    const step = 11.0;
    return ExcludeSemantics(
      child: SizedBox(
        width: size + step * (voters.length - 1),
        height: size,
        child: Stack(
          children: [
            for (var i = 0; i < voters.length; i++)
              PositionedDirectional(
                start: step * i,
                child: PollPersonAvatar(
                  person: voters[i],
                  name: pollPersonName(t, voters[i]),
                  size: size,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.onTap,
    this.filled = false,
    this.danger = false,
    this.busy = false,
  });

  final String label;
  final VoidCallback? onTap;
  final bool filled;
  final bool danger;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    final color = danger ? colors.dangerText : chat.tickRead;
    return Semantics(
      button: true,
      enabled: onTap != null,
      label: label,
      excludeSemantics: true,
      onTap: onTap,
      child: InkWell(
        onTap: busy ? null : onTap,
        borderRadius: BorderRadius.circular(AppRadii.button),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
          child: Container(
            alignment: Alignment.center,
            margin: filled
                ? const EdgeInsets.symmetric(vertical: AppSpacing.xs)
                : null,
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            decoration: filled
                ? BoxDecoration(
                    color: chat.tickRead,
                    borderRadius: BorderRadius.circular(AppRadii.button),
                  )
                : null,
            child: busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(
                    label,
                    textAlign: TextAlign.center,
                    style: typography.button.copyWith(
                      color: filled ? Colors.white : color,
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}
