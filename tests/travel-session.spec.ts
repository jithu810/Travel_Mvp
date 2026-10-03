import { test, expect } from '@playwright/test';
import { newTravelSession, restoreTravelSession, transitionTravel } from '../src/lib/travel/session';

test('travel transitions enforce ordered completion, pause, cancellation and final completion', () => {
  const initial = newTravelSession('journey-a', ['a', 'b'], 100);
  expect(transitionTravel(initial, { type: 'COMPLETE_STOP', stopId: 'a' })).toBe(initial);
  let session = transitionTravel(initial, { type: 'START' }, 101);
  expect(session.status).toBe('ACTIVE');
  expect(transitionTravel(session, { type: 'COMPLETE_STOP', stopId: 'b' })).toBe(session);
  session = transitionTravel(session, { type: 'COMPLETE_STOP', stopId: 'a' }, 102);
  expect(session.completedIds).toEqual(['a']);
  expect(transitionTravel(session, { type: 'COMPLETE_STOP', stopId: 'a' })).toBe(session);
  session = transitionTravel(session, { type: 'PAUSE' }, 103);
  expect(session.status).toBe('PAUSED');
  expect(transitionTravel(session, { type: 'COMPLETE_STOP', stopId: 'b' })).toBe(session);
  const cancelled = transitionTravel(session, { type: 'END' }, 104);
  expect(cancelled.status).toBe('CANCELLED');
  expect(cancelled.completedIds).toEqual(['a']);
  expect(transitionTravel(cancelled, { type: 'RESUME' })).toBe(cancelled);
  session = transitionTravel(session, { type: 'RESUME' }, 105);
  session = transitionTravel(session, { type: 'COMPLETE_STOP', stopId: 'b' }, 106);
  expect(session.status).toBe('COMPLETED');
  expect(transitionTravel(session, { type: 'COMPLETE_STOP', stopId: 'b' })).toBe(session);
  expect(transitionTravel(session, { type: 'RESET' }, 107)).toEqual(newTravelSession('journey-a', ['a', 'b'], 107));
  const empty = newTravelSession('empty', []);
  expect(transitionTravel(empty, { type: 'START' })).toBe(empty);
});

test('restoration rejects stale, foreign, reordered and corrupt sessions and drops unknown fields', () => {
  const now = 10 * 24 * 60 * 60 * 1000;
  const valid = { ...newTravelSession('journey-a', ['a', 'b'], now), status: 'PAUSED', completedIds: ['a'] };
  const restore = (value: unknown, ids = ['a', 'b']) => restoreTravelSession(JSON.stringify(value), 'journey-a', ids, now);
  expect(restore(valid)).toEqual(valid);
  for (const patch of [
    { version: 2 }, { journeyId: 'journey-b' }, { status: 'GPS_TRACKING' },
    { stopIds: ['b', 'a'] }, { stopIds: ['a', 'b', 'c'] }, { completedIds: ['b'] },
    { completedIds: ['a', 'a'] }, { completedIds: ['a', 'b'], status: 'ACTIVE' },
    { completedIds: [], status: 'COMPLETED' }, { status: 'NOT_STARTED' },
    { updatedAt: now - 8 * 24 * 60 * 60 * 1000 }, { updatedAt: now + 1 }, { updatedAt: '100' },
  ]) expect(restore({ ...valid, ...patch })).toBeNull();
  for (const raw of ['invalid json', 'null', '[]', '{}']) expect(restoreTravelSession(raw, 'journey-a', ['a', 'b'], now)).toBeNull();
  expect(restore(valid, ['a', 'c'])).toBeNull();
  expect(restore({ ...valid, latitude: 8, arbitrary: 'drop me' })).toEqual(valid);
  expect(restore({ ...valid, completedIds: ['a', 'b'], status: 'COMPLETED' })?.status).toBe('COMPLETED');
  expect(restore({ ...valid, status: 'CANCELLED' })?.completedIds).toEqual(['a']);
});

test('public Journey Story enters a manual preview without login and survives refresh', async ({ page }, info) => {
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/journey/demo-goa-couple');
  await page.getByRole('link', { name: 'Use This Journey', exact: true }).click();
  await expect(page).toHaveURL(/#journey-route$/);
  await page.getByRole('link', { name: 'Preview Travel Mode' }).click();
  await expect(page).toHaveURL('/travel/demo-goa-couple');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A little slower, a little closer');
  await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'NOT_STARTED');
  await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
  await page.getByRole('button', { name: 'Mark Stop Complete', exact: true }).click();
  await expect(page.getByTestId('travel-progress')).toHaveText('1 / 4 stops · 25%');
  await page.getByRole('button', { name: 'Pause Journey', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'PAUSED');
  await page.getByRole('button', { name: 'Resume Journey', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Mark Stop Complete', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Journey Complete', exact: true })).toBeVisible();
  await expect(page.getByTestId('travel-progress')).toHaveText('4 / 4 stops · 100%');
  await page.reload();
  await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state', 'COMPLETED');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
