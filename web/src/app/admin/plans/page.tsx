import { db } from "@/lib/db";
import { updatePlanAction } from "@/app/actions/admin";
import { Flash, type SP } from "../ui";

export default async function AdminPlans({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const plans = await db.plan.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <>
      <h1 className="text-2xl font-bold">پلن‌ها و قیمت</h1>
      <Flash msg={sp.msg} err={sp.err} />
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((p) => (
          <form key={p.id} action={updatePlanAction} className="card space-y-3">
            <input type="hidden" name="planId" value={p.id} />
            <div className="ltr-num text-start text-xs text-muted">{p.slug}</div>
            <label className="block"><span className="label">عنوان</span><input name="title" defaultValue={p.title} className="input" required /></label>
            <label className="block"><span className="label">مدت (روز)</span><input name="days" type="number" min={1} defaultValue={p.days} className="input" required /></label>
            <label className="block"><span className="label">قیمت (تومان)</span><input name="priceToman" type="number" min={1000} defaultValue={p.priceToman} className="input" required /></label>
            <label className="block"><span className="label">قیمت (USDT)</span><input name="priceUsdt" type="number" step="0.01" min={1} defaultValue={(p.priceUsdtCents / 100).toFixed(2)} className="input" required /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} className="accent-brand" /> فعال (قابل خرید)</label>
            <button className="btn-primary">ذخیره</button>
          </form>
        ))}
      </div>
    </>
  );
}
