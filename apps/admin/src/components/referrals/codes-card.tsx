"use client";

import { CheckCircle, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorNote } from "@/components/page-header";
import { useReason } from "@/components/reason-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Table, TableEmpty, Td, Th } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { growthError } from "@/components/growth/errors";
import { api, errorText } from "@/lib/api/client";
import { formatDateTime } from "@/lib/utils";

type Picked = { id: string; name: string | null; email?: string | null };

/** Referral codes: every code with its owner, and "your own word" as someone's code. */
export function CodesCard({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { ask, dialog } = useReason();
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [code, setCode] = useState("");

  const list = useQuery({
    queryKey: ["referral-codes", filter],
    queryFn: async () =>
      (
        await api.GET("/admin/referrals/codes", {
          params: { query: { q: filter || undefined } },
        })
      ).data!.data,
  });
  const found = useQuery({
    queryKey: ["referral-code-owner-search", search],
    enabled: !picked && search.length >= 2,
    queryFn: async () =>
      (
        await api.GET("/admin/users", {
          params: { query: { q: search, limit: 6 } },
        })
      ).data!.data,
  });

  const clean = code.replace(/[\s-]/g, "").toUpperCase();
  const valid = !!picked && /^[A-Z0-9]{4,24}$/.test(clean);

  const set = useMutation({
    mutationFn: async (reason: string) => {
      return (
        await api.PUT("/admin/referrals/codes", {
          body: { userId: picked!.id, code: clean, reason },
        })
      ).data!.data;
    },
    onSuccess: (row) => {
      toast.success(`Код ${row.code} назначен`);
      setPicked(null);
      setCode("");
      setSearch("");
      qc.invalidateQueries({ queryKey: ["referral-codes"] });
    },
    onError: (e) => toast.error(growthError(e)),
  });

  return (
    <Card className="p-5">
      {dialog}
      <p className="text-sm text-muted">
        Любой пользователь получает код сам. Здесь можно выдать ему своё слово
        вместо случайного кода, например имя блогера или название акции. Старый
        код перестанет работать, уже принятые приглашения останутся.
      </p>

      {canEdit ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Кому назначить" htmlFor="rc-owner">
            {picked ? (
              <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-line-strong bg-surface-2 px-3 py-2.5">
                <CheckCircle
                  size={18}
                  weight="light"
                  className="text-success"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">
                    {picked.name || "Пользователь"}
                  </div>
                  {picked.email ? (
                    <div className="truncate text-xs text-faint">
                      {picked.email}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="Выбрать другого"
                  onClick={() => setPicked(null)}
                  className="text-faint hover:text-ink"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <Input
                  id="rc-owner"
                  placeholder="Имя или email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value.trim())}
                />
                {found.data?.length ? (
                  <ul className="mt-1.5 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface">
                    {found.data.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                          onClick={() =>
                            setPicked({
                              id: u.id,
                              name:
                                [u.firstName, u.lastName]
                                  .filter(Boolean)
                                  .join(" ") || null,
                              email: u.email ?? null,
                            })
                          }
                        >
                          <span className="text-ink">
                            {[u.firstName, u.lastName]
                              .filter(Boolean)
                              .join(" ") ||
                              u.email ||
                              u.id.slice(0, 8)}
                          </span>
                          {u.email ? (
                            <span className="ml-2 text-xs text-faint">
                              {u.email}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </Field>
          <Field
            label="Своё слово"
            htmlFor="rc-code"
            hint="4–24 латинские буквы или цифры, регистр не важен."
          >
            <div className="flex gap-2">
              <Input
                id="rc-code"
                placeholder="SIMA2026"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="uppercase"
              />
              <Button
                type="button"
                disabled={!valid || set.isPending}
                loading={set.isPending}
                onClick={async () => {
                  const r = await ask({
                    title: `Назначить код ${clean}`,
                    description:
                      "Старый код этого пользователя перестанет работать. Укажите причину для журнала.",
                    confirm: "Назначить",
                  });
                  if (r) set.mutate(r.text);
                }}
              >
                Назначить
              </Button>
            </div>
          </Field>
        </div>
      ) : null}

      <form
        className="relative mt-5 max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setFilter(draft.trim());
        }}
      >
        <MagnifyingGlass
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
        />
        <Input
          className="pl-9"
          placeholder="Найти код, имя или email — Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </form>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      <div className="mt-3">
        <Table>
          <thead>
            <tr>
              <Th>Код</Th>
              <Th>Владелец</Th>
              <Th>Пригласил</Th>
              <Th>Создан</Th>
            </tr>
          </thead>
          <tbody>
            {list.data?.length ? (
              list.data.map((r) => (
                <tr key={r.userId}>
                  <Td className="font-mono text-ink">{r.code}</Td>
                  <Td>
                    <div className="text-ink">{r.ownerName || "—"}</div>
                    {r.ownerEmail ? (
                      <div className="text-xs text-faint">{r.ownerEmail}</div>
                    ) : null}
                  </Td>
                  <Td>{r.invited}</Td>
                  <Td className="text-muted">{formatDateTime(r.createdAt)}</Td>
                </tr>
              ))
            ) : (
              <TableEmpty colSpan={4} loading={list.isPending}>
                Кодов пока нет: они появятся, когда пользователи откроют экран
                приглашений.
              </TableEmpty>
            )}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}
