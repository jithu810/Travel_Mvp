export function safeNext(value: string | null | undefined) {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/profile';
}
