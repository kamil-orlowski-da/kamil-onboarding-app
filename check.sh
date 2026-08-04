#!/usr/bin/env bash
# Copyright (c) 2026, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
# SPDX-License-Identifier: 0BSD
#
# Lint (and auto-fix) everything, then test: frontend eslint + tsc, backend Spotless,
# Java tests, Daml tests.
#
#   ./check.sh                 auto-fix what it can, report the rest, then test
#   ./check.sh --check         never write to files; report only (use this in CI)
#   ./check.sh --lint          lint and fix only, no tests
#   ./check.sh --test          tests only
#   ./check.sh --integration   additionally run the Playwright suite (needs a running stack)
#
# Fixing is the default: eslint --fix and spotlessApply rewrite what they can, and each
# still reports whatever it could not fix. Every step runs even if an earlier one fails,
# so one invocation surfaces every problem. Exit status is 0 only if all steps passed.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO="$ROOT/demo"
FRONTEND="$DEMO/frontend"
INTEGRATION="$DEMO/integration-test"

# node/npm/dpm come from the nix flake and are only on PATH inside the direnv environment.
# Re-exec ourselves through direnv so the script works from a plain shell too.
if [[ -z "${CHECK_SH_REEXEC:-}" ]] && ! command -v npm >/dev/null 2>&1; then
    if command -v direnv >/dev/null 2>&1 && [[ -f "$ROOT/.envrc" ]]; then
        export CHECK_SH_REEXEC=1
        exec direnv exec "$ROOT" "$ROOT/$(basename "${BASH_SOURCE[0]}")" "$@"
    fi
    echo "error: npm not found, and could not enter the nix/direnv environment." >&2
    echo "       Install direnv + nix (see .envrc), or put node on your PATH." >&2
    exit 127
fi

DO_LINT=1
DO_TEST=1
DO_FIX=1
DO_INTEGRATION=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --check|--no-fix)     DO_FIX=0 ;;
        --lint|--lint-only)   DO_LINT=1; DO_TEST=0 ;;
        --test|--test-only)   DO_LINT=0; DO_TEST=1; DO_FIX=0 ;;
        --integration)        DO_INTEGRATION=1 ;;
        -h|--help)            sed -n '5,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *)                    echo "error: unknown option '$1' (try --help)" >&2; exit 2 ;;
    esac
    shift
done

BOLD=''; RED=''; GREEN=''; YELLOW=''; DIM=''; RESET=''
if [[ -t 1 ]]; then
    BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'
    YELLOW=$'\033[33m'; DIM=$'\033[2m'; RESET=$'\033[0m'
fi

STEP_NAMES=()
STEP_RESULTS=()

# run <name> <working-dir> <command...>
run() {
    local name="$1" dir="$2"; shift 2
    printf '\n%s==> %s%s %s(%s)%s\n' "$BOLD" "$name" "$RESET" "$DIM" "$*" "$RESET"
    if (cd "$dir" && "$@"); then
        STEP_NAMES+=("$name"); STEP_RESULTS+=(pass)
    else
        STEP_NAMES+=("$name"); STEP_RESULTS+=(fail)
    fi
}

skip() {
    printf '\n%s==> %s%s %s-- skipped: %s%s\n' "$BOLD" "$1" "$RESET" "$YELLOW" "$2" "$RESET"
    STEP_NAMES+=("$1"); STEP_RESULTS+=(skip)
}

# Frontend prerequisites. src/openapi.d.ts is gitignored and generated from the shared
# OpenAPI spec, so a fresh clone has neither it nor node_modules; without them eslint and
# tsc both fail with confusing missing-module errors rather than real findings.
prepare_frontend() {
    if [[ ! -d "$FRONTEND/node_modules" ]]; then
        printf '\n%s==> frontend deps%s %s(npm ci)%s\n' "$BOLD" "$RESET" "$DIM" "$RESET"
        (cd "$FRONTEND" && npm ci) || return 1
    fi
    if [[ ! -f "$FRONTEND/src/openapi.d.ts" ]]; then
        printf '\n%s==> frontend codegen%s %s(npm run gen:openapi)%s\n' "$BOLD" "$RESET" "$DIM" "$RESET"
        (cd "$FRONTEND" && npm run gen:openapi) || return 1
    fi
}

if [[ $DO_LINT -eq 1 ]] && ! prepare_frontend; then
    echo "${RED}error: frontend setup failed; cannot lint or typecheck the frontend.${RESET}" >&2
    exit 1
fi

if [[ $DO_LINT -eq 1 ]]; then
    if [[ $DO_FIX -eq 1 ]]; then
        # Both tools rewrite in place and still report what they could not fix, so a single
        # invocation covers the fix and the check. Nothing auto-fixes type errors, so the
        # typecheck step is the same either way.
        run "lint+fix: frontend eslint"  "$FRONTEND" npm run lint:fix
        run "lint:     frontend types"   "$FRONTEND" npx tsc -b --noEmit
        run "lint+fix: backend spotless" "$DEMO"     ./gradlew :backend:spotlessApply
    else
        run "lint: frontend eslint"    "$FRONTEND" npm run lint
        run "lint: frontend types"     "$FRONTEND" npx tsc -b --noEmit
        run "lint: backend spotless"   "$DEMO"     ./gradlew :backend:spotlessCheck
    fi
fi

if [[ $DO_TEST -eq 1 ]]; then
    # Compiles the Daml model with dpm, then runs the leasing test scripts. Passes
    # vacuously today: leasing-tests has no scripts yet (see TestLease.daml), so this
    # currently proves the model compiles, not that it behaves.
    run "test: daml"    "$DEMO" ./gradlew :daml:testDaml
    # Likewise NO-SOURCE until backend/src/test exists, but worth running: :backend:test
    # pulls in the Daml codegen and the three OpenAPI generators, so it is the real
    # end-to-end compile check for the backend.
    run "test: backend" "$DEMO" ./gradlew :backend:test
    # No frontend test runner is configured (no vitest/jest, no *.test.* files). Reported
    # rather than silently passing so a green run is not mistaken for frontend coverage.
    skip "test: frontend" "no test runner configured in demo/frontend"
fi

if [[ $DO_INTEGRATION -eq 1 ]]; then
    if [[ ! -d "$INTEGRATION/node_modules" ]]; then
        (cd "$INTEGRATION" && npm ci) || true
    fi
    # Playwright drives the real stack: it needs `make start` with TEST_MODE enabled and
    # AUTH_MODE=oauth2, which is why it is opt-in rather than part of a default run.
    run "test: integration (playwright)" "$INTEGRATION" npx playwright test
elif [[ $DO_TEST -eq 1 ]]; then
    skip "test: integration (playwright)" "opt-in, needs a running stack (--integration)"
fi

printf '\n%s%s summary %s\n' "$BOLD" "$(printf '=%.0s' {1..30})" "$RESET"
failed=0
for i in "${!STEP_NAMES[@]}"; do
    case "${STEP_RESULTS[$i]}" in
        pass) printf '  %sPASS%s  %s\n' "$GREEN" "$RESET" "${STEP_NAMES[$i]}" ;;
        fail) printf '  %sFAIL%s  %s\n' "$RED"   "$RESET" "${STEP_NAMES[$i]}"; failed=1 ;;
        skip) printf '  %sSKIP%s  %s\n' "$YELLOW" "$RESET" "${STEP_NAMES[$i]}" ;;
    esac
done

if [[ $DO_FIX -eq 1 && $DO_LINT -eq 1 ]]; then
    printf '\n%sFiles may have been rewritten by eslint --fix / spotlessApply -- review with `git diff`.%s\n' \
        "$DIM" "$RESET"
fi

if [[ $failed -eq 1 ]]; then
    printf '\n%sSome checks failed.%s\n' "$RED" "$RESET"
    exit 1
fi
printf '\n%sAll checks passed.%s\n' "$GREEN" "$RESET"
