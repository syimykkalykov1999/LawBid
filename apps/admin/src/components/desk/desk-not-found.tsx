/** The same «not found» the shell draws for a section that does not exist for you. */
export function DeskNotFound() {
  return (
    <div className="py-24 text-center">
      <div className="text-5xl font-semibold text-faint">404</div>
      <p className="mt-3 text-sm text-muted">Такой страницы нет.</p>
    </div>
  );
}
