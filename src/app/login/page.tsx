import { AuthForm } from '@/components/auth/auth-form';
import { safeNext } from '@/lib/auth/redirect';
export const metadata = { title: 'Login', robots: { index: false, follow: false, noarchive: true } };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  return <section className="mx-auto max-w-md rounded-3xl border border-stone-200 bg-white p-6"><h1 className="text-3xl font-semibold">Your Journey account</h1><p className="mt-3 text-sm text-stone-600">Log in or sign up to save the journeys you love.</p>{params.error && <p role="alert" className="mt-4 text-sm text-red-700">The confirmation link could not be verified. Try the newest email link or log in if already confirmed.</p>}<AuthForm next={safeNext(params.next)}/></section>;
}
