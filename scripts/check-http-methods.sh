#!/usr/bin/env bash
# Checks which HTTP methods reach a given URL vs. get silently dropped/reset
# (useful for diagnosing firewalls/WAFs/gateways that block specific verbs).
#
# Usage:
#   ./check-http-methods.sh <url> [timeout_seconds] [extra curl args...]
#
# Examples:
#   ./check-http-methods.sh https://192.168.0.240/api/v1/projects/1
#   ./check-http-methods.sh https://pia.local/api/v1/projects/1 5 -k
#   ./check-http-methods.sh https://example.com 10 -H "Authorization: Bearer xyz"

set -u

URL="${1:-}"
TIMEOUT="${2:-5}"
shift $(( $# >= 2 ? 2 : $# )) 2>/dev/null
EXTRA_ARGS=("$@")

if [ -z "$URL" ]; then
  echo "Usage: $0 <url> [timeout_seconds] [extra curl args...]"
  exit 1
fi

METHODS=(GET HEAD OPTIONS POST PUT PATCH DELETE)

echo "Target: $URL   (timeout ${TIMEOUT}s per request)"
printf '%-8s %-10s %-10s %-10s  %s\n' "METHOD" "HTTP_CODE" "TIME(s)" "RESULT" "NOTE"
echo "---------------------------------------------------------------------"

BODY_FILE="/tmp/check_http_methods_body_$$"

for M in "${METHODS[@]}"; do
  out=$(curl -sk -m "$TIMEOUT" -o "$BODY_FILE" -w "%{http_code} %{time_total}" \
        -X "$M" "${EXTRA_ARGS[@]}" "$URL" 2>/tmp/curl_err_$$)
  rc=$?
  err=$(cat /tmp/curl_err_$$ 2>/dev/null)
  rm -f /tmp/curl_err_$$

  code=$(echo "$out" | awk '{print $1}')
  time=$(echo "$out" | awk '{print $2}')
  body=$(cat "$BODY_FILE" 2>/dev/null)
  rm -f "$BODY_FILE"

  if [ "$rc" -ne 0 ]; then
    if [ "$rc" -eq 28 ]; then
      result="TIMEOUT"
      note="No response within ${TIMEOUT}s — likely silently dropped (firewall/WAF)"
    else
      result="CONN_FAIL"
      note="curl exit $rc: $err — connection actively refused/reset"
    fi
    code="000"
  elif [ "$code" = "000" ]; then
    result="NO_RESPONSE"
    note="$err"
  elif echo "$body" | grep -qiE "request rejected|support id|blocked by|access denied by|web application firewall|forbidden by administrator"; then
    result="WAF_BLOCK"
    sid=$(echo "$body" | grep -oiE "support id[^0-9]*[0-9]+" | head -1)
    note="200 OK but body is a WAF rejection page (not the real app response). ${sid}"
  else
    result="REACHED"
    note="Server responded — not blocked at network level"
  fi

  printf '%-8s %-10s %-10s %-10s  %s\n' "$M" "$code" "$time" "$result" "$note"
done

echo "---------------------------------------------------------------------"
echo "REACHED    = method got to the server (any http_code, even 401/403/404/405)"
echo "TIMEOUT     = request hung with no reply — classic silent firewall/WAF drop"
echo "CONN_FAIL   = connection actively reset/refused for that method specifically"
echo
echo "Tip: run this same command from two vantage points (e.g. your PC, and"
echo "     'ssh'd into the target server hitting 127.0.0.1) and diff the results."
echo "     If a method fails remotely but passes locally, the block is on the"
echo "     network path in between, not the app/server itself."
