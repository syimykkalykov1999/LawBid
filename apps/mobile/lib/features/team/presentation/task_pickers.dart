import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart'
    show initialsOf;
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/task_editor_screen.dart'
    show normalizeTaskPhone;

final _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

/// Initials of a free-form name ("Anna Kowalski" → "AK").
String personInitials(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  return initialsOf(
    parts.isEmpty ? null : parts.first,
    parts.length > 1 ? parts.last : null,
  );
}

/// A person's small round picture (their photo or initials).
class TaskPersonAvatar extends StatelessWidget {
  const TaskPersonAvatar({
    required this.name,
    this.avatarUrl,
    this.size = 36,
    super.key,
  });

  final String name;
  final String? avatarUrl;
  final double size;

  @override
  Widget build(BuildContext context) => AppAvatar(
        size: size,
        imageProvider: avatarUrl == null ? null : NetworkImage(avatarUrl!),
        initials: personInitials(name),
        semanticLabel: name,
      );
}

// --- Places -----------------------------------------------------------------

/// Owner 2026-10-05: one more address — typed, or picked from the
/// addresses used before (most used first). [initial] edits one.
Future<TaskPlace?> showPlaceEditor(
  BuildContext context, {
  TaskPlace? initial,
  Set<String> taken = const {},
}) =>
    showAppBottomSheet<TaskPlace>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _PlaceSheet(initial: initial, taken: taken),
    );

class _PlaceSheet extends ConsumerStatefulWidget {
  const _PlaceSheet({required this.taken, this.initial});

  final TaskPlace? initial;
  final Set<String> taken;

  @override
  ConsumerState<_PlaceSheet> createState() => _PlaceSheetState();
}

class _PlaceSheetState extends ConsumerState<_PlaceSheet> {
  late final _address = TextEditingController(text: widget.initial?.address);
  late final _label = TextEditingController(text: widget.initial?.label);
  bool _tried = false;

  @override
  void dispose() {
    _address.dispose();
    _label.dispose();
    super.dispose();
  }

  void _save() {
    setState(() => _tried = true);
    final address = _address.text.trim();
    if (address.isEmpty) return;
    final label = _label.text.trim();
    Navigator.of(context).pop(
      TaskPlace(
        id: widget.initial?.id,
        address: address,
        label: label.isEmpty ? null : label,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final q = _address.text.trim().toLowerCase();
    final suggestions = [
      for (final s in ref.watch(taskPlacesProvider).value ??
          const <TaskPlaceSuggestion>[])
        if (!widget.taken.contains(s.address.toLowerCase()) &&
            (q.isEmpty ||
                s.address.toLowerCase().contains(q) ||
                (s.label?.toLowerCase().contains(q) ?? false)))
          s,
    ].take(6).toList();
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        0,
        AppSpacing.screenSide,
        MediaQuery.viewInsetsOf(context).bottom + AppSpacing.xl,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              t.t(
                widget.initial == null ? 'tasks.place.new' : 'tasks.place.edit',
              ),
              style: typography.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              key: const ValueKey('place-address'),
              controller: _address,
              label: t.t('tasks.place.address'),
              leading: const AppIcon(AppIcons.placeOutlined),
              textCapitalization: TextCapitalization.words,
              maxLength: 300,
              autofocus: widget.initial == null,
              errorText: _tried && _address.text.trim().isEmpty
                  ? t.t('post.create.required')
                  : null,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppTextField(
              key: const ValueKey('place-label'),
              controller: _label,
              label: t.t('tasks.place.label'),
              leading: const AppIcon(AppIcons.shortTextRounded),
              textCapitalization: TextCapitalization.sentences,
              maxLength: 80,
            ),
            if (suggestions.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                t.t('tasks.place.recent'),
                style: typography.caption.copyWith(
                  color: colors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
              for (final s in suggestions)
                AppListRow(
                  key: ValueKey('place-suggestion-${s.address}'),
                  icon: AppIcons.historyRounded,
                  label: s.address,
                  subtitle: s.label,
                  flush: true,
                  showChevron: false,
                  onTap: () => Navigator.of(context).pop(
                    TaskPlace(
                      address: s.address,
                      label: _label.text.trim().isEmpty
                          ? s.label
                          : _label.text.trim(),
                    ),
                  ),
                ),
            ],
            const SizedBox(height: AppSpacing.md),
            AppButton(
              key: const ValueKey('place-save'),
              label: t.t(
                widget.initial == null ? 'tasks.place.add' : 'common.save',
              ),
              icon: AppIcons.checkRounded,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}

// --- People -----------------------------------------------------------------

/// Owner 2026-10-05: add people to a task — the team, clients and
/// colleagues from chats, attorneys found by name, contacts used before,
/// or a new outside contact. Several at once; returns the people to add.
Future<List<TaskPerson>?> showPeoplePicker(
  BuildContext context, {
  Set<String> takenUserIds = const {},
}) =>
    showAppBottomSheet<List<TaskPerson>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _PeopleSheet(taken: takenUserIds),
    );

class _PeopleSheet extends ConsumerStatefulWidget {
  const _PeopleSheet({required this.taken});

  final Set<String> taken;

  @override
  ConsumerState<_PeopleSheet> createState() => _PeopleSheetState();
}

class _PeopleSheetState extends ConsumerState<_PeopleSheet> {
  final _search = TextEditingController();
  String _query = '';
  Timer? _debounce;

  /// Picked so far, by a key (user id, or name + phone + email).
  final Map<String, TaskPerson> _picked = {};

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  static String _keyOf(TaskPersonSuggestion s) =>
      s.userId ?? 'c:${s.name}|${s.phone ?? ''}|${s.email ?? ''}';

  Future<void> _newContact() async {
    final typed = _search.text.trim();
    final p = await showContactEditor(
      context,
      initial: typed.isEmpty ? null : TaskPerson(name: typed),
    );
    if (p == null || !mounted) return;
    Navigator.of(context).pop([..._picked.values, p]);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final found = ref.watch(taskPeopleProvider(_query));
    final q = _search.text.trim().toLowerCase();
    final all = [
      for (final s in found.value ?? const <TaskPersonSuggestion>[])
        if (s.userId == null || !widget.taken.contains(s.userId))
          if (q.isEmpty ||
              s.name.toLowerCase().contains(q) ||
              (s.phone?.contains(q) ?? false) ||
              (s.email?.toLowerCase().contains(q) ?? false))
            s,
    ];
    final groups = <TaskPersonSource, List<TaskPersonSuggestion>>{};
    for (final s in all) {
      (groups[s.source] ??= []).add(s);
    }
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.8,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenSide,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    t.t('tasks.people.add'),
                    style: typography.titleMedium.copyWith(color: colors.text),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppTextField(
                    key: const ValueKey('person-search'),
                    controller: _search,
                    label: t.t('tasks.people.search'),
                    leading: const AppIcon(AppIcons.searchRounded),
                    onChanged: (v) {
                      setState(() {});
                      _debounce?.cancel();
                      _debounce = Timer(
                        const Duration(milliseconds: 350),
                        () {
                          if (!mounted) return;
                          final next = v.trim().length >= 2 ? v.trim() : '';
                          if (next != _query) setState(() => _query = next);
                        },
                      );
                    },
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.screenSide,
                  vertical: AppSpacing.sm,
                ),
                children: [
                  AppListRow(
                    key: const ValueKey('person-new'),
                    icon: AppIcons.personAddAlt1Rounded,
                    label: t.t('tasks.people.newContact'),
                    subtitle: t.t('tasks.people.newContactSub'),
                    flush: true,
                    onTap: _newContact,
                  ),
                  if (found.isLoading && all.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(AppSpacing.lg),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  for (final source in TaskPersonSource.values)
                    if (groups[source]?.isNotEmpty ?? false) ...[
                      Padding(
                        padding: const EdgeInsets.only(
                          top: AppSpacing.md,
                          bottom: AppSpacing.xs,
                        ),
                        child: Text(
                          t.t('tasks.people.source.${source.name}'),
                          style: typography.caption.copyWith(
                            color: colors.textSecondary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      for (final s in groups[source]!)
                        _SuggestionRow(
                          key: ValueKey('person-suggestion-${_keyOf(s)}'),
                          s: s,
                          picked: _picked.containsKey(_keyOf(s)),
                          onTap: () {
                            HapticFeedback.selectionClick();
                            setState(() {
                              final k = _keyOf(s);
                              if (_picked.remove(k) == null) {
                                _picked[k] = s.toPerson();
                              }
                            });
                          },
                        ),
                    ],
                  if (!found.isLoading && all.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(AppSpacing.lg),
                      child: Text(
                        t.t('tasks.people.none'),
                        textAlign: TextAlign.center,
                        style: typography.bodySmall
                            .copyWith(color: colors.textSecondary),
                      ),
                    ),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  AppSpacing.md,
                ),
                child: AppButton(
                  key: const ValueKey('person-done'),
                  label: _picked.isEmpty
                      ? t.t('common.close')
                      : t.t('tasks.people.addN', {'n': '${_picked.length}'}),
                  icon: _picked.isEmpty
                      ? AppIcons.closeRounded
                      : AppIcons.checkRounded,
                  variant: _picked.isEmpty
                      ? AppButtonVariant.secondary
                      : AppButtonVariant.primary,
                  onPressed: () =>
                      Navigator.of(context).pop(_picked.values.toList()),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SuggestionRow extends StatelessWidget {
  const _SuggestionRow({
    required this.s,
    required this.picked,
    required this.onTap,
    super.key,
  });

  final TaskPersonSuggestion s;
  final bool picked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final sub = [s.role, s.phone, s.email]
        .whereType<String>()
        .where((x) => x.isNotEmpty)
        .join(' · ');
    return Semantics(
      button: true,
      selected: picked,
      label: s.name,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadii.field),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
            child: Row(
              children: [
                TaskPersonAvatar(name: s.name, avatarUrl: s.avatarUrl),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        s.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: typography.body.copyWith(
                          color: colors.text,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (sub.isNotEmpty)
                        Text(
                          sub,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: typography.caption
                              .copyWith(color: colors.textSecondary),
                        ),
                    ],
                  ),
                ),
                AppIcon(
                  picked
                      ? AppIcons.checkCircleRounded
                      : AppIcons.radioButtonUncheckedRounded,
                  color: picked ? colors.gold : colors.textSecondary,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// An outside contact: name, what they are to the task, phone, email.
/// For a person from the app the name stays theirs.
Future<TaskPerson?> showContactEditor(
  BuildContext context, {
  TaskPerson? initial,
}) =>
    showAppBottomSheet<TaskPerson>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ContactSheet(initial: initial),
    );

class _ContactSheet extends ConsumerStatefulWidget {
  const _ContactSheet({this.initial});

  final TaskPerson? initial;

  @override
  ConsumerState<_ContactSheet> createState() => _ContactSheetState();
}

class _ContactSheetState extends ConsumerState<_ContactSheet> {
  late final _name = TextEditingController(text: widget.initial?.name);
  late final _role = TextEditingController(text: widget.initial?.role);
  late final _phone = TextEditingController(text: widget.initial?.phone);
  late final _email = TextEditingController(text: widget.initial?.email);
  bool _tried = false;

  bool get _inApp => widget.initial?.userId != null;

  @override
  void dispose() {
    for (final c in [_name, _role, _phone, _email]) {
      c.dispose();
    }
    super.dispose();
  }

  void _save() {
    setState(() => _tried = true);
    final name = _name.text.trim();
    final phone = normalizeTaskPhone(_phone.text);
    final email = _email.text.trim();
    if (name.isEmpty ||
        phone == null ||
        (email.isNotEmpty && !_emailRe.hasMatch(email))) {
      return;
    }
    String? v(String s) => s.trim().isEmpty ? null : s.trim();
    final i = widget.initial;
    Navigator.of(context).pop(
      TaskPerson(
        id: i?.id,
        userId: i?.userId,
        userRole: i?.userRole,
        avatarUrl: i?.avatarUrl,
        name: name,
        role: v(_role.text),
        phone: phone.isEmpty ? null : phone,
        email: v(email),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final phoneBad = _tried && normalizeTaskPhone(_phone.text) == null;
    final emailBad = _tried &&
        _email.text.trim().isNotEmpty &&
        !_emailRe.hasMatch(_email.text.trim());
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        0,
        AppSpacing.screenSide,
        MediaQuery.viewInsetsOf(context).bottom + AppSpacing.xl,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              t.t(
                widget.initial?.id != null || _inApp
                    ? 'tasks.people.edit'
                    : 'tasks.people.newContact',
              ),
              style: typography.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              key: const ValueKey('contact-name'),
              controller: _name,
              label: t.t('tasks.people.name'),
              leading: const AppIcon(AppIcons.personOutlineRounded),
              textCapitalization: TextCapitalization.words,
              maxLength: 120,
              enabled: !_inApp,
              autofocus: widget.initial == null,
              errorText: _tried && _name.text.trim().isEmpty
                  ? t.t('post.create.required')
                  : null,
            ),
            const SizedBox(height: AppSpacing.sm),
            AppTextField(
              key: const ValueKey('contact-role'),
              controller: _role,
              label: t.t('tasks.people.role'),
              leading: const AppIcon(AppIcons.badgeOutlined),
              textCapitalization: TextCapitalization.sentences,
              maxLength: 60,
            ),
            const SizedBox(height: AppSpacing.sm),
            AppTextField(
              key: const ValueKey('contact-phone'),
              controller: _phone,
              label: t.t('tasks.field.contactPhone'),
              leading: const AppIcon(AppIcons.phoneOutlined),
              keyboardType: TextInputType.phone,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[+0-9 ()\-]')),
              ],
              errorText: phoneBad ? t.t('tasks.field.phoneInvalid') : null,
              maxLength: 32,
            ),
            const SizedBox(height: AppSpacing.sm),
            AppTextField(
              key: const ValueKey('contact-email'),
              controller: _email,
              label: t.t('tasks.f.email'),
              leading: const AppIcon(AppIcons.mailOutlineRounded),
              keyboardType: TextInputType.emailAddress,
              errorText: emailBad ? t.t('tasks.emailInvalid') : null,
              maxLength: 254,
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              key: const ValueKey('contact-save'),
              label: t.t('common.save'),
              icon: AppIcons.checkRounded,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}

// --- Small choices ----------------------------------------------------------

/// Reminder choices, minutes before the time (null = none).
const taskRemindChoices = <int?>[null, 0, 10, 30, 60, 120, 1440, 2880, 10080];

String taskRemindLabel(Translator t, int? min) => switch (min) {
      null => t.t('tasks.remind.none'),
      0 => t.t('tasks.remind.atTime'),
      < 60 => t.t('tasks.remind.min', {'n': '$min'}),
      < 1440 => t.t('tasks.remind.hours', {'n': '${min ~/ 60}'}),
      < 10080 => t.t('tasks.remind.days', {'n': '${min ~/ 1440}'}),
      _ => t.t('tasks.remind.week'),
    };

String taskRepeatLabel(Translator t, TaskRepeat r) =>
    t.t('tasks.repeat.${r.wire}');

String taskPriorityLabel(Translator t, TaskPriority p) =>
    t.t('tasks.priority.${p.wire}');

/// A plain list of choices in a sheet; returns the picked index.
Future<int?> showChoiceSheet(
  BuildContext context, {
  required String title,
  required List<String> labels,
  int? selected,
  String keyPrefix = 'choice',
}) =>
    showAppBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        final colors = Theme.of(ctx).extension<AppColorTokens>()!;
        final typography = Theme.of(ctx).extension<AppTypographyTokens>()!;
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(ctx).height * 0.7,
            ),
            child: ListView(
              shrinkWrap: true,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    0,
                    AppSpacing.screenSide,
                    AppSpacing.sm,
                  ),
                  child: Text(
                    title,
                    style: typography.titleMedium.copyWith(color: colors.text),
                  ),
                ),
                for (final (i, l) in labels.indexed)
                  AppListRow(
                    key: ValueKey('$keyPrefix-$i'),
                    label: l,
                    selected: i == selected,
                    showChevron: false,
                    onTap: () => Navigator.of(ctx).pop(i),
                  ),
              ],
            ),
          ),
        );
      },
    );
