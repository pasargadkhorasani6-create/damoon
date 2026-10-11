import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">صفحه پیدا نشد</h1>
      <Link href="/" className="btn-primary">
        بازگشت به صفحه‌ی اصلی
      </Link>
    </div>
  );
}
