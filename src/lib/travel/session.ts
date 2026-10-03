export type TravelStatus = 'NOT_STARTED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type TravelSession = { version: 1; journeyId: string; stopIds: string[]; completedIds: string[]; status: TravelStatus; updatedAt: number };
export type TravelEvent = { type: 'START' | 'PAUSE' | 'RESUME' | 'END' | 'RESET' } | { type: 'COMPLETE_STOP'; stopId: string };
export const travelStorageKey = (journeyId: string) => `journeycreator:travel:v1:${journeyId}`;
const maxAge = 7 * 24 * 60 * 60 * 1000;

export function newTravelSession(journeyId: string, stopIds: string[], now = Date.now()): TravelSession {
  return { version: 1, journeyId, stopIds, completedIds: [], status: 'NOT_STARTED', updatedAt: now };
}

// Future arrival detection can emit COMPLETE_STOP through these same ordered guards.
// This reducer has no location, navigation, account or database dependencies.
export function transitionTravel(session: TravelSession, event: TravelEvent, now = Date.now()): TravelSession {
  if (event.type === 'RESET') return newTravelSession(session.journeyId, session.stopIds, now);
  let status = session.status;
  let completedIds = session.completedIds;
  if (event.type === 'START' && status === 'NOT_STARTED' && session.stopIds.length) status = 'ACTIVE';
  else if (event.type === 'PAUSE' && status === 'ACTIVE') status = 'PAUSED';
  else if (event.type === 'RESUME' && status === 'PAUSED') status = 'ACTIVE';
  else if (event.type === 'END' && (status === 'ACTIVE' || status === 'PAUSED')) status = 'CANCELLED';
  else if (event.type === 'COMPLETE_STOP' && status === 'ACTIVE' && session.stopIds[completedIds.length] === event.stopId) {
    completedIds = [...completedIds, event.stopId];
    if (completedIds.length === session.stopIds.length) status = 'COMPLETED';
  } else return session;
  return { ...session, status, completedIds, updatedAt: now };
}

export function restoreTravelSession(raw: string, journeyId: string, stopIds: string[], now = Date.now()): TravelSession | null {
  try {
    const value = JSON.parse(raw) as TravelSession;
    if (!value || value.version !== 1 || value.journeyId !== journeyId || !Array.isArray(value.stopIds) || JSON.stringify(value.stopIds) !== JSON.stringify(stopIds) || !Array.isArray(value.completedIds) || value.completedIds.length > stopIds.length || value.completedIds.some((id, i) => id !== stopIds[i]) || new Set(stopIds).size !== stopIds.length) return null;
    if (!Number.isFinite(value.updatedAt) || value.updatedAt > now || now - value.updatedAt > maxAge || !['NOT_STARTED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'].includes(value.status)) return null;
    if (value.status === 'NOT_STARTED' && value.completedIds.length || value.status === 'COMPLETED' && (!stopIds.length || value.completedIds.length !== stopIds.length) || ['ACTIVE', 'PAUSED'].includes(value.status) && (!stopIds.length || value.completedIds.length === stopIds.length)) return null;
    return { version: 1, journeyId, stopIds, completedIds: value.completedIds, status: value.status, updatedAt: value.updatedAt };
  } catch { return null; }
}
