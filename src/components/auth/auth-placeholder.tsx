import Link from "next/link";

export function AuthPlaceholder() {
  return <Link href="/profile" className="flex min-h-11 items-center rounded-full border border-stone-200 px-4 text-sm font-medium sm:order-last">Login / Profile</Link>;
}
