import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_photos.dart'
    show openCaseDocument;
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart'
    show docLook, fileSizeLabel;
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/plans/presentation/plan_offer.dart';
import 'package:lawbid/features/subscription/presentation/paywall_screen.dart';
import 'package:lawbid/features/templates/application/templates_providers.dart';
import 'package:lawbid/features/templates/domain/doc_template.dart';
import 'package:share_plus/share_plus.dart';

/// Opens the library to choose one template (chat "Attach", the case
/// file "Add files"); null when the user backs out.
Future<DocTemplate?> pickTemplate(BuildContext context) =>
    Navigator.of(context).push<DocTemplate>(
      MaterialPageRoute(builder: (_) => const TemplatesScreen(picker: true)),
    );

/// Owner 2026-10-05 — Settings → Document templates: search, a state
/// (every-state templates always included), popular / new; a template
/// opens a sheet with Download and Share. With [picker] a tap returns the
/// template instead.
class TemplatesScreen extends ConsumerStatefulWidget {
  const TemplatesScreen({super.key, this.picker = false});

  final bool picker;

  @override
  ConsumerState<TemplatesScreen> createState() => _TemplatesScreenState();
}

class _TemplatesScreenState extends ConsumerState<TemplatesScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  TemplatesQuery _query = const TemplatesQuery();

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onSearch(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _query = _query.copyWith(q: text));
    });
  }

  Future<void> _pickState() async {
    final t = ref.read(translatorProvider);
    final picked = await showAppBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(sheet).height * 0.7,
          ),
          child: ListView(
            shrinkWrap: true,
            children: [
              const AppSheetHandle(),
              AppListRow(
                label: t.t('templates.allStates'),
                onTap: () => Navigator.of(sheet).pop(''),
              ),
              for (final s in kRegions)
                AppListRow(
                  label: s.name,
                  trailingText: s.code,
                  onTap: () => Navigator.of(sheet).pop(s.code),
                ),
            ],
          ),
        ),
      ),
    );
    if (picked == null || !mounted) return;
    setState(
      () => _query = picked.isEmpty
          ? _query.withoutState()
          : _query.copyWith(state: picked),
    );
  }

  void _open(DocTemplate tpl) {
    if (widget.picker && tpl.locked) {
      unawaited(openPlanOffer(context, ref, PaywallReason.templates));
      return;
    }
    if (widget.picker) {
      Navigator.of(context).pop(tpl);
      return;
    }
    unawaited(TemplateSheet.show(context, tpl));
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final async = ref.watch(templatesProvider(_query));
    final notifier = ref.read(templatesProvider(_query).notifier);
    final stateName = _query.state == null
        ? t.t('templates.allStates')
        : kRegions
            .firstWhere(
              (s) => s.code == _query.state,
              orElse: () => UsState(_query.state!, _query.state!),
            )
            .name;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(
          t.t(widget.picker ? 'templates.pick' : 'templates.title'),
        ),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        top: false,
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
                controller: _search,
                hintText: t.t('templates.search'),
                semanticLabel: t.t('templates.search'),
                leading: AppIcon(
                  AppIcons.searchRounded,
                  color: colors.textSecondary,
                ),
                textInputAction: TextInputAction.search,
                onChanged: _onSearch,
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenSide,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: AppChip(
                      label: stateName,
                      expand: true,
                      selected: _query.state != null,
                      trailing: AppIcon(
                        AppIcons.expandMoreRounded,
                        size: 18,
                        color: colors.textSecondary,
                      ),
                      onTap: _pickState,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: AppChip(
                      label: t.t('templates.sort.popular'),
                      expand: true,
                      fitLabel: true,
                      selected: !_query.newest,
                      onTap: () => setState(
                        () => _query = _query.copyWith(newest: false),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: AppChip(
                      label: t.t('templates.sort.new'),
                      expand: true,
                      fitLabel: true,
                      selected: _query.newest,
                      onTap: () => setState(
                        () => _query = _query.copyWith(newest: true),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Expanded(
              child: async.when(
                loading: () => Center(
                  child: CircularProgressIndicator(color: colors.gold),
                ),
                error: (e, _) => AppErrorState(
                  message: errorText(t, e),
                  retryLabel: t.t('error.retry'),
                  onRetry: () => ref.invalidate(templatesProvider(_query)),
                ),
                data: (page) => page.items.isEmpty
                    ? AppEmptyState(
                        icon: AppIcons.descriptionOutlined,
                        title: t.t('templates.empty.title'),
                        message: t.t('templates.empty.message'),
                      )
                    : RefreshIndicator(
                        color: colors.gold,
                        onRefresh: notifier.refresh,
                        child: NotificationListener<ScrollNotification>(
                          onNotification: (n) {
                            if (n.metrics.extentAfter < 400) {
                              unawaited(notifier.loadMore());
                            }
                            return false;
                          },
                          child: ListView.separated(
                            padding: const EdgeInsets.fromLTRB(
                              AppSpacing.screenSide,
                              AppSpacing.sm,
                              AppSpacing.screenSide,
                              AppSpacing.xl,
                            ),
                            itemCount: page.items.length +
                                (page.isLoadingMore ? 1 : 0),
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: AppSpacing.md),
                            itemBuilder: (_, i) => i >= page.items.length
                                ? Center(
                                    child: CircularProgressIndicator(
                                      color: colors.gold,
                                    ),
                                  )
                                : TemplateCard(
                                    template: page.items[i],
                                    onTap: () => _open(page.items[i]),
                                  ),
                          ),
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _ext(DocTemplate tpl) => tpl.isPdf
    ? 'pdf'
    : tpl.fileName.toLowerCase().endsWith('.doc')
        ? 'doc'
        : 'docx';

String _meta(Translator t, DocTemplate tpl) => [
      _ext(tpl).toUpperCase(),
      fileSizeLabel(tpl.sizeBytes),
      tpl.state ?? t.t('templates.allStates'),
      if (tpl.practiceKey != null)
        CaseFormat.practice(t, tpl.practiceKey!, tpl.practiceName ?? ''),
    ].join(' · ');

/// One template in the list: type icon, title, two lines of the
/// description, type · size · state · practice, "For attorneys".
class TemplateCard extends ConsumerWidget {
  const TemplateCard({required this.template, required this.onTap, super.key});

  final DocTemplate template;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final look = docLook(_ext(template));
    return Semantics(
      button: true,
      label: [
        t.t('templates.open', {'title': template.title}),
        if (template.locked) t.t('templates.locked'),
      ].join('. '),
      excludeSemantics: true,
      child: AppCard(
        onTap: onTap,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: look.color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(AppRadii.field),
              ),
              alignment: Alignment.center,
              child: AppIcon(look.icon, color: look.color, size: 24),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    template.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: type.titleMedium.copyWith(
                      color: colors.text,
                      fontFamily: type.body.fontFamily,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (template.description.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      template.description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(color: colors.textSecondary),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    _meta(t, template),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                  if (template.lawyersOnly) ...[
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      t.t('templates.lawyersOnly'),
                      style: type.caption.copyWith(
                        color: colors.gold,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (template.locked) ...[
              const SizedBox(width: AppSpacing.sm),
              AppIcon(
                AppIcons.lockOutlineRounded,
                color: colors.textSecondary,
                size: 20,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// A template's details with Download (opens the signed link: the phone
/// saves or previews it) and Share (the file to another app).
class TemplateSheet extends ConsumerStatefulWidget {
  const TemplateSheet({required this.template, super.key});

  final DocTemplate template;

  static Future<void> show(BuildContext context, DocTemplate template) =>
      showAppBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => TemplateSheet(template: template),
      );

  @override
  ConsumerState<TemplateSheet> createState() => _TemplateSheetState();
}

class _TemplateSheetState extends ConsumerState<TemplateSheet> {
  String? _busy;

  Future<void> _run(String what, Future<void> Function() job) async {
    if (_busy != null) return;
    setState(() => _busy = what);
    try {
      await job();
    } on Object catch (e) {
      if (!mounted) return;
      if (isPlanRequired(e)) {
        unawaited(openPlanOffer(context, ref, PaywallReason.templates));
        return;
      }
      final t = ref.read(translatorProvider);
      showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _download() => _run('download', () async {
        final d = await ref
            .read(templatesRepositoryProvider)
            .download(widget.template.id);
        await openCaseDocument(d.url);
      });

  Future<void> _share(Rect? origin) => _run('share', () async {
        final repo = ref.read(templatesRepositoryProvider);
        final d = await repo.download(widget.template.id);
        final bytes = await repo.bytes(d.url);
        await SharePlus.instance.share(
          ShareParams(
            files: [XFile.fromData(bytes, mimeType: d.mime, name: d.fileName)],
            fileNameOverrides: [d.fileName],
            sharePositionOrigin: origin,
          ),
        );
      });

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final tpl = widget.template;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.85,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            0,
            AppSpacing.screenSide,
            AppSpacing.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              Text(
                tpl.title,
                style: type.titleLarge.copyWith(color: colors.text),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                [
                  _meta(t, tpl),
                  t.t('templates.downloads', {'count': '${tpl.downloadCount}'}),
                ].join(' · '),
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
              if (tpl.description.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.md),
                Text(
                  tpl.description,
                  style: type.body.copyWith(color: colors.text),
                ),
              ],
              const SizedBox(height: AppSpacing.md),
              Text(
                t.t('templates.disclaimer'),
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.lg),
              if (tpl.locked) ...[
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppIcon(
                      AppIcons.lockOutlineRounded,
                      color: colors.gold,
                      size: 20,
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        t.t('templates.lockedHint'),
                        style: type.body.copyWith(color: colors.text),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  label: t.t('templates.seePlans'),
                  icon: AppIcons.lockOpenRounded,
                  onPressed: () {
                    Navigator.of(context).pop();
                    unawaited(
                      openPlanOffer(context, ref, PaywallReason.templates),
                    );
                  },
                ),
              ] else ...[
                AppButton(
                  label: t.t('templates.download'),
                  icon: AppIcons.downloadRounded,
                  isLoading: _busy == 'download',
                  onPressed: _busy == null ? _download : null,
                ),
                const SizedBox(height: AppSpacing.sm),
                Builder(
                  builder: (b) => AppButton(
                    label: t.t('templates.share'),
                    icon: AppIcons.iosShareRounded,
                    variant: AppButtonVariant.secondary,
                    isLoading: _busy == 'share',
                    onPressed: _busy == null
                        ? () {
                            final box = b.findRenderObject() as RenderBox?;
                            unawaited(
                              _share(
                                box == null
                                    ? null
                                    : box.localToGlobal(Offset.zero) & box.size,
                              ),
                            );
                          }
                        : null,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
