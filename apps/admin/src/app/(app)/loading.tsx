import { Skeleton } from '@/components/ui/empty';

/** D-14: instant skeleton while a page streams in; the sidebar stays put. */
export default function AppLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
