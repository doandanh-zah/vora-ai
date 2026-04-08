#!/usr/bin/env bash

VORA_DOCKER_LIVE_AUTH_ALL=(.claude .codex .minimax)
VORA_DOCKER_LIVE_AUTH_FILES_ALL=(.claude.json)

vora_live_trim() {
  local value="${1:-}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

vora_live_normalize_auth_dir() {
  local value
  value="$(vora_live_trim "${1:-}")"
  [[ -n "$value" ]] || return 1
  value="${value#.}"
  printf '.%s' "$value"
}

vora_live_should_include_auth_dir_for_provider() {
  local provider
  provider="$(vora_live_trim "${1:-}")"
  case "$provider" in
    anthropic | claude-cli)
      printf '%s\n' ".claude"
      ;;
    codex-cli | openai-codex)
      printf '%s\n' ".codex"
      ;;
    minimax | minimax-portal)
      printf '%s\n' ".minimax"
      ;;
  esac
}

vora_live_should_include_auth_file_for_provider() {
  local provider
  provider="$(vora_live_trim "${1:-}")"
  case "$provider" in
    anthropic | claude-cli)
      printf '%s\n' ".claude.json"
      ;;
  esac
}

vora_live_collect_auth_dirs_from_csv() {
  local raw="${1:-}"
  local token normalized
  [[ -n "$(vora_live_trim "$raw")" ]] || return 0
  IFS=',' read -r -a tokens <<<"$raw"
  for token in "${tokens[@]}"; do
    while IFS= read -r normalized; do
      printf '%s\n' "$normalized"
    done < <(vora_live_should_include_auth_dir_for_provider "$token")
  done | awk 'NF && !seen[$0]++'
}

vora_live_collect_auth_dirs_from_override() {
  local raw token normalized
  raw="$(vora_live_trim "${VORA_DOCKER_AUTH_DIRS:-}")"
  [[ -n "$raw" ]] || return 1
  case "$raw" in
    all)
      printf '%s\n' "${VORA_DOCKER_LIVE_AUTH_ALL[@]}"
      return 0
      ;;
    none)
      return 0
      ;;
  esac
  IFS=',' read -r -a tokens <<<"$raw"
  for token in "${tokens[@]}"; do
    normalized="$(vora_live_normalize_auth_dir "$token")" || continue
    printf '%s\n' "$normalized"
  done | awk '!seen[$0]++'
  return 0
}

vora_live_collect_auth_dirs() {
  if vora_live_collect_auth_dirs_from_override; then
    return 0
  fi
  printf '%s\n' "${VORA_DOCKER_LIVE_AUTH_ALL[@]}"
}

vora_live_collect_auth_files_from_csv() {
  local raw="${1:-}"
  local token normalized
  [[ -n "$(vora_live_trim "$raw")" ]] || return 0
  IFS=',' read -r -a tokens <<<"$raw"
  for token in "${tokens[@]}"; do
    while IFS= read -r normalized; do
      printf '%s\n' "$normalized"
    done < <(vora_live_should_include_auth_file_for_provider "$token")
  done | awk 'NF && !seen[$0]++'
}

vora_live_collect_auth_files_from_override() {
  local raw
  raw="$(vora_live_trim "${VORA_DOCKER_AUTH_DIRS:-}")"
  [[ -n "$raw" ]] || return 1
  case "$raw" in
    all)
      printf '%s\n' "${VORA_DOCKER_LIVE_AUTH_FILES_ALL[@]}"
      return 0
      ;;
    none)
      return 0
      ;;
  esac
  return 0
}

vora_live_collect_auth_files() {
  if vora_live_collect_auth_files_from_override; then
    return 0
  fi
  printf '%s\n' "${VORA_DOCKER_LIVE_AUTH_FILES_ALL[@]}"
}

vora_live_join_csv() {
  local first=1 value
  for value in "$@"; do
    [[ -n "$value" ]] || continue
    if (( first )); then
      printf '%s' "$value"
      first=0
    else
      printf ',%s' "$value"
    fi
  done
}
