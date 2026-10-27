'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './journey-hero.module.css';

/** Decorative WebGL globe. Links to real journeys remain outside the canvas. */
export function JourneyGlobe() {
  const host = useRef<HTMLDivElement>(null);
  const turn = useRef<(amount: number) => void>(() => {});
  const setAnimation = useRef<(running: boolean) => void>(() => {});
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const node = host.current;
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const element: HTMLDivElement = node;
    let disposed = false;
    const resources: (() => void)[] = [];
    const dispose = () => {
      while (resources.length) {
        try { resources.pop()?.(); } catch { /* Continue releasing the remaining resources. */ }
      }
      element.classList.remove(styles.active);
      turn.current = () => {};
      setAnimation.current = () => {};
    };

    async function setup() {
      try {
        const THREE = await import('three');
        if (disposed) return;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
        resources.push(() => renderer.dispose());
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.setAttribute('aria-hidden', 'true');
        element.appendChild(renderer.domElement);
        resources.push(() => renderer.domElement.remove());
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        camera.position.z = 6;
        const group = new THREE.Group();
        group.rotation.set(-0.18, 0.4, -0.12);
        scene.add(group);
        scene.add(new THREE.AmbientLight(0xc5e5c5, 1.35));
        const sunlight = new THREE.DirectionalLight(0xffe4af, 2.8);
        sunlight.position.set(-3, 4, 5);
        scene.add(sunlight);
        const sphereGeometry = new THREE.SphereGeometry(1.5, 48, 32);
        resources.push(() => sphereGeometry.dispose());
        const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0x365c4d, roughness: 0.83, metalness: 0.06 });
        resources.push(() => sphereMaterial.dispose());
        group.add(new THREE.Mesh(sphereGeometry, sphereMaterial));
        const gridMaterial = new THREE.LineBasicMaterial({ color: 0xc9dfb9, transparent: true, opacity: 0.27 });
        resources.push(() => gridMaterial.dispose());
        const radius = 1.505;
        for (let latitude = -75; latitude <= 75; latitude += 15) {
          const phi = latitude * Math.PI / 180;
          const points = Array.from({ length: 129 }, (_, i) => {
            const angle = i * Math.PI * 2 / 128;
            return new THREE.Vector3(radius * Math.cos(phi) * Math.cos(angle), radius * Math.sin(phi), radius * Math.cos(phi) * Math.sin(angle));
          });
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          resources.push(() => geometry.dispose());
          group.add(new THREE.Line(geometry, gridMaterial));
        }
        for (let longitude = 0; longitude < 180; longitude += 15) {
          const theta = longitude * Math.PI / 180;
          const points = Array.from({ length: 129 }, (_, i) => {
            const angle = i * Math.PI * 2 / 128;
            return new THREE.Vector3(radius * Math.sin(angle) * Math.cos(theta), radius * Math.cos(angle), radius * Math.sin(angle) * Math.sin(theta));
          });
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          resources.push(() => geometry.dispose());
          group.add(new THREE.Line(geometry, gridMaterial));
        }
        // Abstract route dots are decorative; they do not represent live locations.
        const markerGeometry = new THREE.SphereGeometry(0.034, 12, 8);
        resources.push(() => markerGeometry.dispose());
        const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xf6d18b });
        resources.push(() => markerMaterial.dispose());
        [[0.6, 0.8, 1.12], [-0.45, 0.35, 1.39], [1.15, -0.35, 0.9], [-0.8, -0.55, 1.14]].forEach(([x, y, z]) => {
          const marker = new THREE.Mesh(markerGeometry, markerMaterial);
          marker.position.set(x, y, z).normalize().multiplyScalar(1.52);
          group.add(marker);
        });
        let frame: number | null = null;
        let visible = false;
        let contextLost = false;
        let dragging = false;
        let previousX = 0;
        let previousY = 0;
        let autoRotate = true;
        const canRender = () => !disposed && !contextLost && visible && document.visibilityState === 'visible';
        const schedule = () => {
          if (frame === null && canRender()) frame = requestAnimationFrame(render);
        };
        const render = () => {
          frame = null;
          if (!canRender()) return;
          if (autoRotate && !dragging) group.rotation.y += 0.0015;
          renderer.render(scene, camera);
          if (autoRotate && !dragging) schedule();
        };
        const cancel = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; };
        resources.push(cancel);
        const resize = () => {
          const width = element.clientWidth, height = element.clientHeight;
          if (!width || !height) return;
          camera.aspect = width / height; camera.updateProjectionMatrix();
          renderer.setSize(width, height, false); schedule();
        };
        const onDown = (event: PointerEvent) => {
          dragging = true; previousX = event.clientX; previousY = event.clientY;
          renderer.domElement.setPointerCapture(event.pointerId);
        };
        const onMove = (event: PointerEvent) => {
          if (!dragging) return;
          group.rotation.y += (event.clientX - previousX) * 0.008;
          group.rotation.x = Math.max(-1, Math.min(1, group.rotation.x + (event.clientY - previousY) * 0.008));
          previousX = event.clientX; previousY = event.clientY; schedule();
        };
        const onUp = () => { dragging = false; schedule(); };
        const onContextLost = (event: Event) => { event.preventDefault(); contextLost = true; cancel(); element.classList.remove(styles.active); };
        const onVisibility = () => { if (document.visibilityState === 'visible') schedule(); else cancel(); };
        renderer.domElement.addEventListener('pointerdown', onDown);
        resources.push(() => renderer.domElement.removeEventListener('pointerdown', onDown));
        renderer.domElement.addEventListener('pointermove', onMove);
        resources.push(() => renderer.domElement.removeEventListener('pointermove', onMove));
        renderer.domElement.addEventListener('pointerup', onUp);
        resources.push(() => renderer.domElement.removeEventListener('pointerup', onUp));
        renderer.domElement.addEventListener('pointercancel', onUp);
        resources.push(() => renderer.domElement.removeEventListener('pointercancel', onUp));
        renderer.domElement.addEventListener('webglcontextlost', onContextLost);
        resources.push(() => renderer.domElement.removeEventListener('webglcontextlost', onContextLost));
        document.addEventListener('visibilitychange', onVisibility);
        resources.push(() => document.removeEventListener('visibilitychange', onVisibility));
        const observer = new ResizeObserver(resize); resources.push(() => observer.disconnect()); observer.observe(element);
        const visibilityObserver = new IntersectionObserver(entries => {
          visible = entries[0]?.isIntersecting ?? false;
          if (visible) schedule(); else cancel();
        });
        resources.push(() => visibilityObserver.disconnect()); visibilityObserver.observe(element);
        turn.current = amount => { group.rotation.y += amount; schedule(); };
        setAnimation.current = running => { autoRotate = running; if (running) schedule(); else cancel(); };
        resize(); element.classList.add(styles.active);
      } catch {
        // Release partial setup as well as leaving the styled fallback visible.
        dispose();
      }
    }
    void setup();
    return () => { disposed = true; dispose(); };
  }, []);

  return <div className={styles.globeArea}>
    <div ref={host} className={styles.globeCanvas} aria-hidden="true"><div className={styles.globeFallback} /></div>
    <div className={styles.orbit} aria-hidden="true" />
    <div className={styles.globeCaption}>THE WORLD IS WAITING <span aria-hidden="true">✳</span></div>
    <div className={styles.globeControls} aria-label="Decorative globe controls">
      <button type="button" onClick={() => turn.current(-0.4)} aria-label="Rotate globe left">←</button>
      <button type="button" onClick={() => turn.current(0.4)} aria-label="Rotate globe right">→</button>
      <button type="button" className={styles.pause} aria-label={paused ? 'Resume globe rotation' : 'Pause globe rotation'} onClick={() => {
        setAnimation.current(paused);
        setPaused(!paused);
      }}>{paused ? 'Play' : 'Pause'}</button>
    </div>
  </div>;
}
