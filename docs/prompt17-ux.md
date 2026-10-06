# Prompt 17: compact navigation and immediate stop editing

6 October 2026. Local review build; no commit, push, or deployment.

## Navigation HUD

Travel Mode's existing compact presentation now uses a maneuver icon, immediate maneuver distance, and the provider instruction (including the road name when supplied). A small next-stop line and distance/duration row retain trip context. Normal guidance uses about 120px of height in the checked 360px layout; automated checks require no more than 150px and less than 38% of the map height across all six viewports.

The full destination name, provider instruction, route steps, estimate caveat, and stale-route explanation remain available through Navigation details. This is an on-demand popover inside the same HUD. Escape closes it and restores summary focus; a subsequent Escape can collapse the expanded map. Loading, GPS loss, weak GPS, rerouting, arrival, and route errors still use the existing state and feedback. Error text and route retry remain immediately accessible.

Both map states use the same component, navigation state, and map instance. Existing right-side reserved controls, attribution clearance, progress and pause/end controls remain. No changes were made to the map renderer, camera, GPS, maneuver matching, route controller, rerouting, or track implementation.

## Stop capture

Successful Search, Current Location, and Pick on Map additions activate the exact newly generated stop ID, select its map marker, open its existing Details & photo section, focus its name field, and scroll its card into view. Scrolling respects reduced-motion preferences and waits for the pin dialog's normal focus restoration. A highlighted card and active-stop message identify the new editing target.

Name, description/note, photo, day, rating, coordinates, location editing, reorder, remove, and map view remain available in the same editor. Save stop calls the existing full journey save path, with an explicit explanation that it saves the stop and other journey changes. Upload/save confirmations appear in that active card; validation errors retain the existing sticky global presentation. Removing the active stop clears its active state.

There is no new dialog, duplicate editor, capture model, upload route, storage policy, image limit, reverse geocoder, or GPS watcher. Existing cards remain editable. New additions preserve prior stop IDs, order and metadata, and rejected duplicate additions do not change the active stop.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build`: passed on the final source with the normal configured production build.
- `npm run test:db`: passed, including authentication/RLS, media ownership and private-track regressions.
- Final public/unit suite: 102 passed; four configured-Auth cases intentionally skipped in the unconfigured public build.
- Configured Auth suite: eight passed, covering the skipped cases with the existing local fixture.
- Focused core unit suite including the icon edge cases: 32 passed. Street names containing Left/Right do not determine the arrow; ambiguous instructions retain their provider text and use a neutral cue.
- Initial targeted creation/field-test/capture run: 14 passed on desktop and mobile.
- Full creation and travel browser suite: 68 passed, including discovery, social/remix, editing/uploads, GPS permission/lifecycle, navigation/rerouting, route transitions and private-track recovery.
- Final fresh-build HUD/capture recheck after the icon correction: all eight passed on desktop and mobile.

The new capture test uploads a photo and edits notes/ratings for search stops and GPS/pin stops; saves/reloads five stops; verifies exact IDs, order and retained metadata; and edits an existing stop afterward. Existing field-test coverage verifies profile switching, ordered arrival, clearing old blue geometry, retaining purple history, expanded-map restoration and the single watcher. The live map check measures HUD height, checks the maneuver icon and road instruction, and exercises details/Escape in both map states.

## Browser QA

Viewports: 360×800, 390×844, 412×915, 844×390, 1280×900, 1440×1000. All are exercised for normal and expanded live Mapbox Standard maps and GPS/pin editing cards, with overflow and reachable save checks. Search capture is checked on desktop/mobile; the shared capture editor is also exercised at every listed viewport. Portrait and landscape screenshots were visually inspected, including the current-location marker, map controls, attribution, and active-card photo/save controls.

Directions and GPS are simulated for repeatable state transitions; Mapbox Standard basemaps render live where configured. Stop-pin rendering uses the real Mapbox renderer with a deterministic test basemap. Uploads use the existing local service fixture and real application upload/validation path. Screenshots and temporary test configuration remain ignored under `test-results/`.

## Limitations

- Long provider instructions and destination names use a compact preview; Navigation details contains their full text. No road names or directions are invented.
- Expanded stop cards may need a short local scroll on small screens to reach all fields or a photo preview. The traveler is brought directly to the correct card rather than searching the journey list.
- Photo upload and Save stop retain existing journey validation. Required journey information must be entered before upload/save succeeds.
- Virtual-keyboard behavior, physical GPS movement and real road guidance still need phone field-testing. Browser automation does not establish their physical accuracy.
- Existing camera behavior is unchanged. Manual panning can place map features under any floating overlay; the smaller HUD and reserved controls keep the map center clear in checked following layouts.

No database migration, dependency, authentication/RLS, SEO, Journey Story, route semantics, or private-track architecture change is required.

## Files changed

- `src/components/travel/navigation-panel.tsx`
- `src/app/globals.css`
- `src/components/journey/journey-builder.tsx`
- `src/components/map/place-search.tsx`
- `tests/creation/creation.spec.ts`
- `tests/creation/social-loop.spec.ts`
- `tests/creation/field-test.spec.ts`
- `tests/creation/prompt17.spec.ts`
- `tests/navigation-ux.spec.ts`
- `docs/prompt17-ux.md`
