export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (err) return <p className="rounded-xl border border-down/40 bg-down/10 p-3 text-sm text-down" role="alert">{err}</p>;
  if (msg) return <p className="rounded-xl border border-up/40 bg-up/10 p-3 text-sm text-up">{msg}</p>;
  return null;
}

export function Table({ head, children, testId }: { head: string[]; children: React.ReactNode; testId?: string }) {
  return (
    <div className="card overflow-x-auto !p-0">
      <table className="w-full text-sm" data-testid={testId}>
        <thead className="text-muted">
          <tr className="border-b border-line">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap p-3 text-start font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:p-3 [&_tr]:border-b [&_tr]:border-line/50">{children}</tbody>
      </table>
    </div>
  );
}

export type SP = Promise<{ msg?: string; err?: string; q?: string; status?: string; page?: string }>;
export const PAGE_SIZE = 50;
export const pageOf = (p?: string) => Math.max(1, Number(p) || 1);
