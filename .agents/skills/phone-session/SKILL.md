---
name: phone-session
description: Connect the product owner's Android phone and load the Journey Creator Mobile dev client so changes can be seen on the real device. Use once per conversation, the first time an authorized Mobile feature, bug or design task needs to look at the phone (screenshots, checking a UI change, reproducing a bug). Skip if this conversation has already confirmed the phone and Metro are working and nothing has failed since.
---

# Phone session

Shared by Claude Code and Codex. This file is the only copy of the instructions; `.claude/skills/phone-session/SKILL.md` points here. It lives in the Web repo, so it's available to sessions started in the Web repo (where the Architect coordinates Mobile work). Sessions started only in the Mobile repo don't see it.

Run this once per conversation, and only when a Mobile task is authorized. Run it again only if a later adb or Metro command fails. It changes no tracked files; Metro creates its gitignored `.expo/` folder in the Mobile repo.

Who runs it: the Architect or the Mobile Developer. QA Tester and Code Reviewer are read-only by default and need an approved scope change before running adb or Metro.

Wireless adb and Metro need local network access. If your agent runs commands in a sandbox and adb can't reach the phone or a background process gets stopped, ask the product owner for approval to run those commands outside the sandbox. Don't try to get around the sandbox some other way.

## 1. Check the current state

From the Web repo root, run the status script with Git Bash. Don't use plain `bash` from PowerShell on Windows: it may start WSL, which can't see the Windows adb or Metro.

- Shell is already Git Bash, macOS or Linux: `bash .agents/skills/phone-session/check.sh`
- PowerShell on Windows: `& "$env:ProgramFiles\Git\bin\bash.exe" .agents/skills/phone-session/check.sh`

It changes no files and prints:
- `ADB=<path>` or `ADB=none`
- `MOBILE_REPO=<path>` or `MOBILE_REPO=none`
- `DEVICE=<serial>` or `DEVICE=none`, plus `DEVICE_COUNT=<n>`
- `REVERSE=ok|missing`
- `APP_FOCUS=yes|no`
- `METRO=ipv4|ipv6-only|down`

Use the printed `ADB` path (written in `C:/...` form so PowerShell can use it too) and `-s <serial>` for every adb command below.

- **ADB=none:** ask the product owner where the Android SDK platform-tools are installed, or to set `ANDROID_HOME`. Don't install anything.
- **MOBILE_REPO=none:** ask where the Mobile repository is checked out, or to set `MOBILE_REPO`. By default the script looks for `Travel_Mvp_Mobile` next to the Web repo.
- **DEVICE_COUNT above 1:** the phone is often listed twice (its IP:port and an `adb-...` mDNS name); the script picks the IP:port. If a different device is also connected, ask which one to use.

## 2. Fix only what is missing

- **DEVICE=none:** ask the product owner for the IP:port shown on the phone's Wireless debugging screen, then run `adb connect <ip:port>`. If that fails with "failed to connect" even though the port is reachable, this computer needs pairing: ask for the "Pair device with pairing code" IP:port and code, then run `adb pair <ip:port> <code>` and connect again. Pairing is needed once per computer. Never guess ports, and never enter the phone's lock PIN.
- **REVERSE=missing:** `adb -s <serial> reverse tcp:8081 tcp:8081`
- **METRO=down:** in the Mobile repo, start Metro as a long-running background process, so it keeps running after the command returns:
  - bash: `NODE_OPTIONS=--dns-result-order=ipv4first npx expo start --dev-client --localhost`
  - PowerShell: `$env:NODE_OPTIONS = "--dns-result-order=ipv4first"; npx expo start --dev-client --localhost`

  Wait until `curl.exe -s http://127.0.0.1:8081/status` (`curl` in bash) returns `packager-status:running`. The NODE_OPTIONS setting is required: without it Metro may listen only on IPv6 `[::1]`, and the adb tunnel (IPv4) can't reach it, so the dev launcher's Connect fails with no error. Don't set CI=1 because it turns off fast refresh. If you can't keep a background process alive, ask the product owner to run the command in their own terminal.
- **METRO=ipv6-only:** Metro was started without the IPv4 option. Tell the product owner, then stop that Metro process (only if this conversation started it; otherwise ask first) and restart it as above.
- **APP_FOCUS=no** (or after restarting Metro): open the dev client pointed at Metro:

      adb -s <serial> shell am start -a android.intent.action.VIEW -d "journeycreator://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" com.sree8100.journeycreatormobile

  If the screen is locked (`isKeyguardShowing=true` in `adb -s <serial> shell dumpsys window`), ask the product owner to unlock it. If the app isn't installed (`adb -s <serial> shell pm path com.sree8100.journeycreatormobile` prints nothing), say a development build must be installed; building or installing one needs separate approval.

## 3. Confirm

Take a screenshot by saving it on the phone and pulling it into a temporary or scratch folder (never inside a repository). This works the same in every shell, unlike redirecting `exec-out` output, which PowerShell 5.1 corrupts:

    adb -s <serial> shell screencap -p /sdcard/phone-session.png
    adb -s <serial> pull /sdcard/phone-session.png <scratch-dir>/screen.png
    adb -s <serial> shell rm /sdcard/phone-session.png

Look at the image. Report in one or two lines: the device, whether Metro is running, and what screen is showing. Then continue with the task, using the same screenshot steps to check changes on the device.

## Notes

- The dev client uses the real backend. Looking, scrolling and navigating are fine. Any tap that saves, creates, edits, deletes or uploads data writes to the live Supabase project, so it needs explicit product-owner approval for that action first.
- Physical-device screenshots are device evidence. Mocks and exports are not.
- Don't upgrade Expo packages because Metro suggests it; that needs an explicit request.
- Never read .env files. Metro printing the variable names is fine; never print their values.
