#!/usr/bin/env bash
# Read-only status check for the phone dev session. Changes no files
# (running adb may start the adb server in the background).
# Explicit argument, then METRO_PORT, then legacy Codex default.
port="${1:-${METRO_PORT:-8081}}"
if ! [[ "$port" =~ ^[0-9]{1,5}$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then
  echo "Invalid Metro port: use an integer from 1 to 65535" >&2
  exit 2
fi
port=$((10#$port))
echo "METRO_PORT=$port"
pkg="com.sree8100.journeycreatormobile"
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null && pwd)"
web_root="$(cd -- "$here/../../.." >/dev/null && pwd)"

# Print paths that PowerShell can also use (C:/... instead of /c/...) under Git Bash.
native_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s\n' "$1"; fi
}

# Find adb: $ADB, PATH, then the usual SDK locations.
adb="${ADB:-}"
if [ -z "$adb" ]; then
  adb="$(command -v adb 2>/dev/null || true)"
fi
if [ -z "$adb" ]; then
  for sdk in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "${LOCALAPPDATA:-}/Android/Sdk" "$HOME/Android/Sdk" "$HOME/Library/Android/sdk"; do
    for exe in adb.exe adb; do
      if [ -n "$sdk" ] && [ -x "$sdk/platform-tools/$exe" ]; then
        adb="$sdk/platform-tools/$exe"
        break 2
      fi
    done
  done
fi
if [ -n "$adb" ]; then echo "ADB=$(native_path "$adb")"; else echo "ADB=none"; fi

# Find the Mobile repo: $MOBILE_REPO, then a sibling of this repo.
mobile="${MOBILE_REPO:-$(dirname -- "$web_root")/Travel_Mvp_Mobile}"
if [ -f "$mobile/app.json" ]; then
  echo "MOBILE_REPO=$(native_path "$mobile")"
else
  echo "MOBILE_REPO=none"
fi

# The phone can be listed twice (ip:port and an mDNS adb-... name); both are the same device.
serials=""
if [ -n "$adb" ]; then
  serials=$("$adb" devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1}')
fi
serial=$(printf '%s\n' "$serials" | grep -m1 -E '^[0-9.]+:[0-9]+$' || printf '%s\n' "$serials" | head -n1)
if [ -n "${PHONE_SERIAL:-}" ]; then
  serial=$(printf '%s\n' "$serials" | awk -v wanted="$PHONE_SERIAL" '$0==wanted {print; exit}')
fi
echo "DEVICE=${serial:-none}"
echo "DEVICE_COUNT=$(printf '%s\n' "$serials" | grep -c .)"

if [ -n "$serial" ]; then
  if "$adb" -s "$serial" reverse --list 2>/dev/null | awk -v endpoint="tcp:$port" '$2==endpoint && $3==endpoint {found=1} END {exit !found}' ; then
    echo "REVERSE=ok"
  else
    echo "REVERSE=missing"
  fi
  if "$adb" -s "$serial" shell dumpsys window 2>/dev/null | grep "mCurrentFocus" | grep -q "$pkg"; then
    echo "APP_FOCUS=yes"
  else
    echo "APP_FOCUS=no"
  fi
else
  echo "REVERSE=missing"
  echo "APP_FOCUS=no"
fi

# Status alone does not prove Metro belongs to the expected checkout or computer.
if curl -s -m 3 "http://127.0.0.1:$port/status" | grep -q running; then
  echo "METRO=ipv4"
elif curl -s -g -m 3 "http://[::1]:$port/status" | grep -q running; then
  echo "METRO=ipv6-only"
else
  echo "METRO=down"
fi
