import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/limits/text_limits.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/pop_if_current.dart';
import 'package:lawbid/core/navigation/safe_back.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/chat/presentation/open_direct_chat.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_widgets.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart'
    show showReportSheet;
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:material_ui/material_ui.dart';

/// Owner 2026-10-20: a question with its answers. The author marks the
/// best answer; verified attorneys answer, like, message and report.
class QuestionDetailScreen extends ConsumerStatefulWidget {
  const QuestionDetailScreen({required this.id, super.key});

  final String id;

  @override
  ConsumerState<QuestionDetailScreen> createState() =>
      _QuestionDetailScreenState();
}

class _QuestionDetailScreenState extends ConsumerState<QuestionDetailScreen> {
  final _reply = TextEditingController();
  bool _busy = false;
  String? _error;
  bool _editing = false;

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  /// Owner 27.11 («скачки»): the answers keep the order the screen opened
  /// with until a pull or a «best» pick, and a like shows at once.
  List<String>? _order;
  final Map<String, ({bool on, int count})> _likes = {};

  Future<void> _like(Question q, QaAnswer a) async {
    final t = ref.read(translatorProvider);
    final on = !a.likedByMe;
    setState(() {
      _likes[a.id] = (on: on, count: a.likeCount + (on ? 1 : -1));
    });
    try {
      await ref.read(legalQaRepositoryProvider).like(q.id, a.id, on: on);
      if (!mounted) return;
      _refresh();
      try {
        await ref.read(questionDetailProvider(widget.id).future);
      } on Object {
        // The screen shows the error; the like stays as sent.
      }
      if (mounted) setState(() => _likes.remove(a.id));
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _likes.remove(a.id));
      showAppSnackBar(context, errorText(t, e));
    }
  }

  void _refresh() {
    ref.invalidate(questionDetailProvider(widget.id));
    // Package F: the lists catch up (Mine by a delta), no reload.
    ref.read(questionsTouchedProvider.notifier).bump();
  }

  /// Runs [call]; shows the error as a snack bar, refreshes on success.
  Future<void> _run(Future<void> Function() call) async {
    final t = ref.read(translatorProvider);
    try {
      await call();
      if (mounted) _refresh();
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _send() async {
    final t = ref.read(translatorProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(legalQaRepositoryProvider)
          .answer(widget.id, _reply.text.trim());
      if (!mounted) return;
      // Owner 27.11 («скачки»): the composer gives way to «answered» in
      // the same frame the new answer card comes in (not one round trip
      // earlier, as an empty composer first and the hint later).
      _refresh();
      try {
        await ref.read(questionDetailProvider(widget.id).future);
      } on Object {
        // The screen shows the error; the answer itself was sent.
      }
      if (!mounted) return;
      _reply.clear();
      setState(() {
        _busy = false;
        _editing = false;
      });
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e is ApiException && e.code == ApiErrorCodes.rateLimited
            ? t.t('qa.answer.limit')
            : errorText(t, e);
      });
    }
  }

  Future<void> _closeQuestion() async {
    final t = ref.read(translatorProvider);
    final yes = await showConfirmSheet(
      context,
      t: t,
      title: t.t('qa.close.title'),
      message: t.t('qa.close.msg'),
      confirmLabel: t.t('qa.close'),
    );
    if (!yes || !mounted) return;
    await _run(() => ref.read(legalQaRepositoryProvider).close(widget.id));
  }

  Future<void> _deleteQuestion() async {
    final t = ref.read(translatorProvider);
    final yes = await showConfirmSheet(
      context,
      t: t,
      title: t.t('qa.deleteQ.title'),
      message: t.t('qa.deleteQ.msg'),
      confirmLabel: t.t('qa.delete'),
      destructive: true,
    );
    if (!yes || !mounted) return;
    try {
      await ref.read(legalQaRepositoryProvider).delete(widget.id);
      ref.read(questionsTouchedProvider.notifier).bump();
      if (mounted) unawaited(context.maybePopIfCurrent<void>());
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _deleteAnswer() async {
    final t = ref.read(translatorProvider);
    final yes = await showConfirmSheet(
      context,
      t: t,
      title: t.t('qa.deleteA.title'),
      message: t.t('qa.deleteA.msg'),
      confirmLabel: t.t('qa.delete'),
      destructive: true,
    );
    if (!yes || !mounted) return;
    await _run(
      () => ref.read(legalQaRepositoryProvider).deleteAnswer(widget.id),
    );
  }

  void _openMenu(Question q) {
    final t = ref.read(translatorProvider);
    unawaited(
      showAppBottomSheet<void>(
        context: context,
        builder: (sheet) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppSheetHandle(),
              if (q.isMine && !q.closed)
                AppListRow(
                  icon: AppIcons.checkRounded,
                  label: t.t('qa.close'),
                  showChevron: false,
                  onTap: () {
                    Navigator.of(sheet).pop();
                    unawaited(_closeQuestion());
                  },
                ),
              if (q.isMine)
                AppListRow(
                  icon: AppIcons.deleteOutlineRounded,
                  label: t.t('qa.delete'),
                  destructive: true,
                  showChevron: false,
                  onTap: () {
                    Navigator.of(sheet).pop();
                    unawaited(_deleteQuestion());
                  },
                )
              else
                AppListRow(
                  icon: AppIcons.flagOutlined,
                  label: t.t('qa.report'),
                  destructive: true,
                  showChevron: false,
                  onTap: () {
                    Navigator.of(sheet).pop();
                    unawaited(
                      showReportSheet(
                        context,
                        ref,
                        ReportTarget.legalQuestion,
                        q.id,
                      ),
                    );
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final async = ref.watch(questionDetailProvider(widget.id));
    final q = async.value;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('qa.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => context.safeBack(),
        ),
        actions: [
          if (q != null)
            AppIconButton(
              icon: AppIcon(AppIcons.moreVertRounded, color: colors.text),
              semanticLabel: t.t('qa.more'),
              onPressed: () => _openMenu(q),
            ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: async.when(
          loading: () => const CasesListSkeleton(count: 2),
          error: (e, _) => AppErrorState(
            message: errorText(t, e),
            retryLabel: t.t('error.retry'),
            onRetry: () => ref.invalidate(questionDetailProvider(widget.id)),
          ),
          data: (q) => Column(
            children: [
              Expanded(
                child: AppRefreshIndicator(
                  color: colors.gold,
                  onRefresh: () async {
                    try {
                      ref.invalidate(questionDetailProvider(widget.id));
                      await ref.read(questionDetailProvider(widget.id).future);
                    } on Object {
                      // The provider now holds the error and the screen
                      // shows it; the pull spinner must just end.
                    }
                    // A pull is the moment to sort again.
                    if (mounted) setState(() => _order = null);
                  },
                  child: _Body(
                    question: q,
                    order: _order ??= [
                      for (final a in _Body._ordered(q.answers)) a.id,
                    ],
                    likes: _likes,
                    onLike: (a) => _like(q, a),
                    onBest: (a) async {
                      await _run(
                        () => ref
                            .read(legalQaRepositoryProvider)
                            .setBest(q.id, a.isBest ? null : a.id),
                      );
                      try {
                        await ref
                            .read(questionDetailProvider(widget.id).future);
                      } on Object {
                        // The screen shows the error.
                      }
                      // Picking the best answer moves it up on purpose.
                      if (mounted) setState(() => _order = null);
                    },
                    onEditMine: (a) => setState(() {
                      _editing = true;
                      _reply.text = a.body;
                    }),
                    onDeleteMine: _deleteAnswer,
                  ),
                ),
              ),
              _Composer(
                question: q,
                controller: _reply,
                busy: _busy,
                error: _error,
                editing: _editing,
                onCancelEdit: () => setState(() {
                  _editing = false;
                  _reply.clear();
                }),
                onChanged: () => setState(() {}),
                onSend: _send,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({
    required this.question,
    required this.onLike,
    required this.onBest,
    required this.onEditMine,
    required this.onDeleteMine,
    this.order,
    this.likes = const {},
  });

  /// The answers' order to keep (null: best, then most liked).
  final List<String>? order;

  /// Likes put in before the server answered, by answer id.
  final Map<String, ({bool on, int count})> likes;

  final Question question;
  final void Function(QaAnswer) onLike;
  final void Function(QaAnswer) onBest;
  final void Function(QaAnswer) onEditMine;
  final VoidCallback onDeleteMine;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final q = question;
    final area = q.practiceArea;
    final author = q.author;
    final name =
        author?.displayName ?? (q.isMine ? t.t('qa.anonMine') : t.t('qa.anon'));
    QaAnswer patched(QaAnswer a) {
      final like = likes[a.id];
      if (like == null) return a;
      return QaAnswer(
        id: a.id,
        questionId: a.questionId,
        attorney: a.attorney,
        body: a.body,
        likeCount: like.count,
        likedByMe: like.on,
        isBest: a.isBest,
        isMine: a.isMine,
        createdAt: a.createdAt,
      );
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpacing.screenSide),
      children: [
        QaPersonRow(
          name: name,
          avatarUrl: author?.avatarUrl,
          subtitle: SocialFormat.ago(t, formats, q.createdAt),
        ),
        const SizedBox(height: AppSpacing.md),
        Text(q.title, style: type.titleLarge.copyWith(color: colors.text)),
        const SizedBox(height: AppSpacing.sm),
        SelectableText(q.body, style: type.body.copyWith(color: colors.text)),
        const SizedBox(height: AppSpacing.md),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          children: [
            if (area != null) QaTag(label: qaAreaLabel(t, area)),
            if (q.stateCode != null) QaTag(label: q.stateCode!),
            if (q.closed) QaTag(label: t.t('qa.closed')),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        // Owner 2026-10-21: «Решён» on the «Ответы» row, at the end.
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Flexible(
              child: Text(
                t.t('qa.answersTitle'),
                style: type.titleMedium.copyWith(color: colors.text),
              ),
            ),
            if (q.solved) Flexible(child: QaBestBadge(label: t.t('qa.solved'))),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        if (q.answers.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
            child: Text(
              t.t('qa.noAnswers'),
              style: type.body.copyWith(color: colors.textSecondary),
            ),
          )
        else
          for (final a in _inOrder(q.answers, order).map(patched)) ...[
            _AnswerCard(
              key: ValueKey('qa-answer-${a.id}'),
              answer: a,
              asker: q.isMine,
              onLike: () => onLike(a),
              onBest: () => onBest(a),
              onEdit: () => onEditMine(a),
              onDelete: onDeleteMine,
            ),
            const SizedBox(height: AppSpacing.md),
          ],
        const SizedBox(height: AppSpacing.sm),
        Text(
          t.t('qa.disclaimer'),
          style: type.legalFine.copyWith(color: colors.textSecondary),
        ),
      ],
    );
  }

  /// Owner 27.11 («скачки»): the order the screen opened with stays while
  /// it is open (a like does not send the card to another place under the
  /// finger, as on Reddit / Stack Overflow until a reload); answers that
  /// came later follow in the usual order.
  static List<QaAnswer> _inOrder(List<QaAnswer> list, List<String>? order) {
    if (order == null) return _ordered(list);
    final at = {for (var i = 0; i < order.length; i++) order[i]: i};
    final known = [
      for (final a in list)
        if (at.containsKey(a.id)) a,
    ]..sort((a, b) => at[a.id]!.compareTo(at[b.id]!));
    return [
      ...known,
      ..._ordered([
        for (final a in list)
          if (!at.containsKey(a.id)) a,
      ]),
    ];
  }

  /// The best answer first, then the most liked.
  static List<QaAnswer> _ordered(List<QaAnswer> list) =>
      [...list]..sort((a, b) {
          if (a.isBest != b.isBest) return a.isBest ? -1 : 1;
          return b.likeCount.compareTo(a.likeCount);
        });
}

class _AnswerCard extends ConsumerWidget {
  const _AnswerCard({
    required this.answer,
    super.key,
    required this.asker,
    required this.onLike,
    required this.onBest,
    required this.onEdit,
    required this.onDelete,
  });

  final QaAnswer answer;

  /// The viewer asked the question (may mark the best answer).
  final bool asker;
  final VoidCallback onLike;
  final VoidCallback onBest;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    // Owner 2026-10-21: only clients like answers (the server says 403).
    final attorney = ref.watch(actsAsAttorneyProvider);
    final a = answer;
    final username = a.attorney.username;
    Widget action({
      required IconData icon,
      required String label,
      required VoidCallback onTap,
      Color? color,
      String? shown,
    }) =>
        Semantics(
          button: true,
          label: label,
          excludeSemantics: true,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppRadii.pill),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
              child: Padding(
                padding: const EdgeInsetsDirectional.symmetric(
                  horizontal: AppSpacing.sm,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AppIcon(
                      icon,
                      size: 20,
                      color: color ?? colors.textSecondary,
                    ),
                    if (shown ?? label case final text
                        when text.isNotEmpty) ...[
                      const SizedBox(width: AppSpacing.xs),
                      Flexible(
                        child: Text(
                          text,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          // Tabular: 1 → 2 likes keeps the width, so the
                          // actions beside it stay put (owner 27.11).
                          style: type.caption.copyWith(
                            color: color ?? colors.textSecondary,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        );
    // Owner 2026-10-23: the best answer carries a green frame; every answer
    // is an attorney's, marked with the verified tick and its caption.
    final card = AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (a.isBest) ...[
            QaBestBadge(label: t.t('qa.best')),
            const SizedBox(height: AppSpacing.sm),
          ],
          QaPersonRow(
            name: a.attorney.displayName,
            avatarUrl: a.attorney.avatarUrl,
            verified: true,
            subtitle: '${t.t('qa.verified')} · '
                '${SocialFormat.ago(t, formats, a.createdAt)}',
            onTap: username == null
                ? null
                : () => context.push(AppRoutes.lawyer(username)),
          ),
          const SizedBox(height: AppSpacing.sm),
          SelectableText(a.body, style: type.body.copyWith(color: colors.text)),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.xs,
            children: [
              if (!attorney)
                action(
                  icon: a.likedByMe
                      ? AppIcons.thumbUpAltRounded
                      : AppIcons.thumbUpAltOutlined,
                  // Owner 2026-10-20: icon + counter, no words.
                  label: t.t('qa.like'),
                  shown: a.likeCount > 0 ? formats.number(a.likeCount) : '',
                  color: a.likedByMe ? colors.goldDark : null,
                  onTap: onLike,
                ),
              if (asker)
                action(
                  icon: a.isBest
                      ? AppIcons.checkCircleRounded
                      : AppIcons.checkCircleOutlineRounded,
                  label: t.t(a.isBest ? 'qa.unmarkBest' : 'qa.markBest'),
                  onTap: onBest,
                ),
              if (!a.isMine)
                action(
                  icon: AppIcons.chatBubbleOutlineRounded,
                  label: t.t('qa.write'),
                  onTap: () =>
                      unawaited(openDirectChat(context, ref, a.attorney.id)),
                ),
              if (username != null && !a.isMine)
                action(
                  icon: AppIcons.personOutlineRounded,
                  label: t.t('qa.profile'),
                  onTap: () => context.push(AppRoutes.lawyer(username)),
                ),
              if (a.isMine) ...[
                action(
                  icon: AppIcons.editOutlined,
                  label: t.t('qa.edit'),
                  onTap: onEdit,
                ),
                action(
                  icon: AppIcons.deleteOutlineRounded,
                  label: t.t('qa.delete'),
                  color: colors.dangerText,
                  onTap: onDelete,
                ),
              ],
              // Owner 2026-10-21: no «Report» on an answer; the disclaimer
              // under the answers says it is one attorney's opinion. Abuse
              // stays reportable from the attorney's profile.
            ],
          ),
        ],
      ),
    );
    if (!a.isBest) return card;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.success, width: 1.5),
      ),
      child: card,
    );
  }
}

/// The answer box: for a verified attorney who has not answered yet (or is
/// editing); a one-line hint for other attorneys.
class _Composer extends ConsumerWidget {
  const _Composer({
    required this.question,
    required this.controller,
    required this.busy,
    required this.error,
    required this.editing,
    required this.onCancelEdit,
    required this.onChanged,
    required this.onSend,
  });

  final Question question;
  final TextEditingController controller;
  final bool busy;
  final String? error;
  final bool editing;
  final VoidCallback onCancelEdit;
  final VoidCallback onChanged;
  final VoidCallback onSend;

  static const _min = 10;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final attorney = ref.watch(actsAsAttorneyProvider);
    final q = question;
    final canWrite = (q.canAnswer && q.myAnswerId == null) || editing;
    if (!canWrite) {
      final hint = q.myAnswerId != null
          ? t.t('qa.answered')
          : attorney && !q.isMine
              // Owner 2026-10-21: say why the box is gone.
              ? q.closed
                  ? t.t('qa.closed')
                  : q.answersEnough
                      ? t.t('qa.enough')
                      : t.t('qa.answer.only')
              : null;
      if (hint == null) return const SizedBox.shrink();
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: colors.surface,
          border: Border(top: BorderSide(color: colors.border)),
        ),
        child: Text(
          hint,
          style: type.caption.copyWith(color: colors.textSecondary),
        ),
      );
    }
    final valid = controller.text.trim().length >= _min;
    return Container(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.sm,
        AppSpacing.screenSide,
        AppSpacing.sm + MediaQuery.viewInsetsOf(context).bottom * 0,
      ),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(top: BorderSide(color: colors.border)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppTextField(
            controller: controller,
            hintText: t.t('qa.answer.hint'),
            semanticLabel: t.t('qa.answer.hint'),
            tapAnywhere: true,
            maxLines: 4,
            maxLength: TextLimits.of(TextLimit.answer),
            textCapitalization: TextCapitalization.sentences,
            onChanged: (_) => onChanged(),
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Semantics(
                liveRegion: true,
                child: Text(
                  error!,
                  style: type.caption.copyWith(color: colors.dangerText),
                ),
              ),
            ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              if (editing) ...[
                Expanded(
                  child: AppButton(
                    label: t.t('common.cancel'),
                    variant: AppButtonVariant.secondary,
                    onPressed: onCancelEdit,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
              ],
              Expanded(
                child: AppButton(
                  label: t.t('qa.answer.send'),
                  isLoading: busy,
                  isEnabled: valid,
                  disabledHint: t.t('qa.fill'),
                  onPressed: valid ? onSend : null,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Owner 2026-10-21: a tap on a question lifts this sheet (like the comments
/// of Instagram) with the question and the attorneys' answers; the full
/// screen stays for deep links.
Future<void> showQuestionSheet(BuildContext context, String id) {
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  return showAppBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.92,
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(AppRadii.sheet),
        ),
        child: ColoredBox(
          color: colors.bg,
          child: QuestionDetailScreen(id: id),
        ),
      ),
    ),
  );
}
