'use client';
import { useEffect, useRef, useState } from 'react';
import { getMapboxToken } from '@/lib/env';
import { destinationKey, emptyNavigation, NavigationController, requestRoadRoute, type NavigationInput } from '@/lib/travel/navigation';

export function useTravelNavigation(input: Omit<NavigationInput, 'online'>) {
  const [state, setState] = useState(emptyNavigation);
  const controller = useRef<NavigationController | null>(null);
  const latest = useRef(input);
  const token = getMapboxToken() || '';
  useEffect(() => { latest.current = input; }, [input]);
  useEffect(() => {
    const service = new NavigationController((origin, destination, signal) => requestRoadRoute(origin, destination, token, signal), setState);
    controller.current = service;
    const update = () => service.update({ ...latest.current, online: navigator.onLine });
    const initial = setTimeout(update, 0), tick = setInterval(update, 2000);
    window.addEventListener('offline', update); window.addEventListener('online', update);
    return () => { clearTimeout(initial); clearInterval(tick); window.removeEventListener('offline', update); window.removeEventListener('online', update); service.stop(); controller.current = null; };
  }, [token]);
  useEffect(() => {
    const timer = setTimeout(() => controller.current?.update({ ...input, online: navigator.onLine }), 0);
    return () => clearTimeout(timer);
  }, [input]);
  // Never expose a previous destination's route, even before effect cleanup runs.
  const visible = input.status === 'ACTIVE' && destinationKey(input.destination) === state.destinationKey ? state : emptyNavigation();
  return { ...visible, retry: () => controller.current?.update({ ...latest.current, online: navigator.onLine }, true) };
}
