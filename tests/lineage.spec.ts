import { expect, test } from '@playwright/test';
import { resolvePublicRoot, lineageDepthLimit, type LineageNode } from '../src/lib/journey/lineage';
const id = (number: number) => `20000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
const node = (number: number, parent: number | null): LineageNode => ({ id: id(number), title: `Journey ${number}`, copiedFrom: parent === null ? null : id(parent) });

test('lineage confirms the public root without confusing it with the direct parent', async () => {
  const chain = new Map([node(1, null), node(2, 1), node(3, 2), node(4, 3)].map(n => [n.id, n]));
  const calls: string[] = [];
  const current = chain.get(id(4))!;
  expect(current.copiedFrom).toBe(id(3));
  const result = await resolvePublicRoot(current, async key => { calls.push(key); return chain.get(key) || null; });
  expect(result.root?.id).toBe(id(1)); expect(result.reason).toBe('complete');
  expect(calls).toEqual([id(3), id(2), id(1)]);
  const original = await resolvePublicRoot(node(1, null), async () => { throw new Error('Unnecessary original lookup'); });
  expect(original.root?.id).toBe(id(1));
});

test('private, deleted, failed and malformed hops never invent a root', async () => {
  for (const lookup of [async () => null, async () => { throw new Error('Unavailable'); }, async () => node(99, null)]) {
    expect((await resolvePublicRoot(node(3, 2), lookup)).root).toBeNull();
  }
  let calls = 0;
  expect((await resolvePublicRoot({ ...node(3, null), copiedFrom: 'malformed' }, async () => { calls++; return null; })).reason).toBe('invalid');
  expect(calls).toBe(0);
  const result = await resolvePublicRoot(node(3, 2), async key => key === id(2) ? node(2, 1) : null);
  expect(result.reason).toBe('unavailable'); expect(result.root).toBeNull();
});

test('cycles and deep historical chains are bounded', async () => {
  let calls = 0;
  const cycle = await resolvePublicRoot(node(1, 2), async () => { calls++; return node(2, 1); });
  expect(cycle.reason).toBe('cycle'); expect(calls).toBe(1);
  expect((await resolvePublicRoot(node(1, 1), async () => { throw new Error('Self cycle must not fetch'); })).reason).toBe('cycle');
  calls = 0;
  const deep = await resolvePublicRoot(node(1, 2), async key => { calls++; const n = Number(key.slice(-12)); return node(n, n + 1); }, 999);
  expect(deep.reason).toBe('depth-limit'); expect(calls).toBe(lineageDepthLimit);
  const uppercase = { id: 'ABCDEF12-0000-0000-0000-000000000001', title: 'Case cycle', copiedFrom: 'abcdef12-0000-0000-0000-000000000001' };
  expect((await resolvePublicRoot(uppercase, async () => { throw new Error('Case-insensitive cycle must not fetch'); })).reason).toBe('cycle');
});
