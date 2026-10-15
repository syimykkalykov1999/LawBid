'use client';

import { PageHeader } from '@/components/page-header';
import { SearchAdmin } from '@/components/search/search-admin';

/** Owner 2026-10-15: search that understands everyday words. */
export default function SearchPage() {
  return (
    <>
      <PageHeader
        eyebrow="Модерация"
        title="Поиск"
        subtitle="Какие слова поиск считает одним и тем же, что люди искали и не нашли, и чему он научился сам. Правки работают сразу, без обновления приложения."
      />
      <SearchAdmin />
    </>
  );
}
