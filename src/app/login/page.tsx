import { AuthForm } from '@/components/auth/auth-form';
import { safeNext } from '@/lib/auth/redirect';
import Link from 'next/link';
export const metadata = { title: 'Login', robots: { index: false, follow: false, noarchive: true } };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const explanation = next.startsWith('/create') ? 'Sign in to create a journey. Your draft stays private until you publish it.' : next === '/saved' ? 'Sign in to find the journeys you’ve saved for later.' : 'Log in or sign up to save the journeys you love.';
  return <section className="mx-auto max-w-md rounded-3xl border border-stone-200 bg-white p-6"><h1 className="text-3xl font-semibold">Your Journey account</h1><p className="mt-3 text-sm leading-6 text-stone-600">{explanation}</p>{params.error && <p role="alert" className="mt-4 text-sm text-red-700">The confirmation link could not be verified. Try the newest email link or log in if already confirmed.</p>}<AuthForm next={next}/><Link href="/explore" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-brand underline">Continue Exploring</Link></section>;
}
