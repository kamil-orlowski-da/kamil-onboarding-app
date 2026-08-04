#!/usr/bin/env bash
# Copyright (c) 2026, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
# SPDX-License-Identifier: 0BSD
#
# Bring the local stack up to date with the working tree, restarting only the services
# whose inputs actually changed, and open dev-links.html when it is up.
#
#   ./dev.sh              rebuild, restart what changed, leave the rest running
#   ./dev.sh --fresh      tear the whole stack down first and start it from scratch
#   ./dev.sh --clean      --fresh, and delete the project's volumes (wipes the ledger)
#   ./dev.sh --no-build   do not rebuild; still restart services whose artifacts moved
#   ./dev.sh --no-wait    do not wait for readiness
#   ./dev.sh --no-open    do not open dev-links.html in a browser
#   ./dev.sh --vite       once the stack is up, run the Vite dev server in the foreground
#   ./dev.sh --stop       tear the stack down and exit
#   ./dev.sh --dry-run    print every command it would run, change nothing
#   ./dev.sh --timeout N  seconds to wait for readiness (default 900)
#
# Canton and Splice take minutes to bootstrap and hold the ledger, so tearing them down
# to pick up a frontend edit is the expensive mistake. This fingerprints the three build
# artifacts the containers actually consume -- the backend tarball, frontend/dist and the
# DAR, all bind-mounted -- plus the resolved Compose config, and compares them against a
# stamp written by the last successful run. Only the consumers of what moved get
# restarted; everything else is left alone.
#
# Two things make that safe. A bind-mounted artifact does not change container config, so
# Compose will not notice it on its own and the restart has to be explicit. And
# splice-onboarding records its progress in /tmp inside the container rather than in the
# onboarding volume, so replacing that one container re-uploads a changed DAR without
# touching Canton.
#
# Anything the fingerprints cannot speak for falls back to a full recreate: a changed
# Compose config (an .env edit, a profile or image change), a missing stamp, or a stack
# that is not running. Everything is driven through demo/Makefile rather than docker
# compose directly, because the file set, profiles and env files there are assembled from
# half a dozen conditionals and a second copy would drift.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO="$ROOT/demo"

usage() { sed -n '5,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

# Answered before the direnv re-exec below, so `--help` stays instant and quiet.
for _arg in "$@"; do
    case "$_arg" in -h|--help) usage; exit 0 ;; esac
done

# node, java and dpm come from the nix flake and are only on PATH inside the direnv
# environment, as is the GNU make the Makefile needs. Re-exec through direnv so the
# script works from a plain shell too.
if [[ -z "${DEV_SH_REEXEC:-}" ]]; then
    _missing=0
    for _tool in npm java dpm; do
        command -v "$_tool" >/dev/null 2>&1 || _missing=1
    done
    if [[ $_missing -eq 1 ]]; then
        if command -v direnv >/dev/null 2>&1 && [[ -f "$ROOT/.envrc" ]]; then
            export DEV_SH_REEXEC=1
            exec direnv exec "$ROOT" "$ROOT/$(basename "${BASH_SOURCE[0]}")" "$@"
        fi
        echo "error: npm/java/dpm not found, and could not enter the nix/direnv environment." >&2
        echo "       Install direnv + nix (see .envrc), or put the toolchain on your PATH." >&2
        exit 127
    fi
fi

DO_BUILD=1
DO_START=1
DO_WAIT=1
DO_OPEN=1
FRESH=0
CLEAN=0
VITE=0
DRY_RUN=0
WAIT_SECONDS=900
PAGE="$ROOT/dev-links.html"
STAMP="$DEMO/build/dev-sh.state"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --fresh|--recreate) FRESH=1 ;;
        --clean)            CLEAN=1; FRESH=1 ;;
        --no-build)         DO_BUILD=0 ;;
        --no-wait)          DO_WAIT=0 ;;
        --no-open)          DO_OPEN=0 ;;
        --vite)             VITE=1 ;;
        --stop|--down)      DO_START=0; DO_WAIT=0; FRESH=1 ;;
        --dry-run|-n)       DRY_RUN=1 ;;
        --timeout)          shift; WAIT_SECONDS="${1:-900}" ;;
        *)                  echo "error: unknown option '$1' (try --help)" >&2; exit 2 ;;
    esac
    shift
done

BOLD=''; RED=''; GREEN=''; YELLOW=''; DIM=''; RESET=''
TTY=0
if [[ -t 1 ]]; then
    TTY=1
    BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'
    YELLOW=$'\033[33m'; DIM=$'\033[2m'; RESET=$'\033[0m'
fi

say()  { printf '\n%s==> %s%s\n' "$BOLD" "$*" "$RESET"; }
note() { printf '    %s%s%s\n' "$DIM" "$*" "$RESET"; }
warn() { printf '%swarning:%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die()  { printf '\n%serror:%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

# run <command...> -- echo the command, then run it unless --dry-run.
run() {
    printf '    %s$ %s%s\n' "$DIM" "$*" "$RESET"
    [[ $DRY_RUN -eq 1 ]] && return 0
    "$@"
}

############################################################################
####  Fingerprints
############################################################################

if command -v shasum >/dev/null 2>&1; then
    sha_stdin() { shasum -a 256 | cut -d' ' -f1; }
elif command -v sha256sum >/dev/null 2>&1; then
    sha_stdin() { sha256sum | cut -d' ' -f1; }
else
    # Without a hash tool there is no way to tell what changed, so every run has to
    # assume everything did.
    sha_stdin() { printf 'no-sha-tool'; }
    FRESH=1
fi

fp_file() { [[ -f "$1" ]] && sha_stdin < "$1" || printf 'absent'; }

# Name, size and content of every file, in a stable order.
fp_dir() {
    [[ -d "$1" ]] || { printf 'absent'; return; }
    ( cd "$1" && find . -type f -exec cksum {} + 2>/dev/null | LC_ALL=C sort ) | sha_stdin
}

# The resolved Compose config is the ground truth for everything the fingerprints above
# cannot see: env files, profiles, image tags, port and volume wiring.
fp_config() { make -C "$DEMO" compose-config 2>/dev/null | sha_stdin; }

BACKEND_TAR="$DEMO/backend/build/distributions/backend.tar"
FRONTEND_DIST="$DEMO/frontend/dist"
DAML_DAR="$DEMO/daml/leasing/.daml/dist/demo-leasing-0.0.1.dar"

# stamp_get <key> -- value recorded by the last successful run, or empty.
stamp_get() {
    [[ -f "$STAMP" ]] || return 0
    sed -n "s/^$1=//p" "$STAMP" | tail -n 1
}

stamp_write() {
    [[ $DRY_RUN -eq 1 ]] && return 0
    mkdir -p "$(dirname "$STAMP")" || return 1
    {
        echo "# written by dev.sh; describes the artifacts the running stack was started from"
        echo "config=$1"
        echo "backend=$2"
        echo "frontend=$3"
        echo "daml=$4"
    } > "$STAMP"
}

############################################################################
####  Compose project
############################################################################

# The Compose project name is what labels the containers and prefixes the volumes we
# sweep below. Make includes demo/.env then demo/.env.local, and docker compose applies
# --env-file in the same order, so the last assignment across the two wins.
project_name() {
    local v
    v="$(grep -hE '^[[:space:]]*COMPOSE_PROJECT_NAME=' "$DEMO/.env" "$DEMO/.env.local" 2>/dev/null \
        | tail -n 1 | cut -d= -f2- \
        | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")"
    printf '%s' "${v:-$(basename "$DEMO")}"
}

# ps_project <docker-ps-args...> -- docker ps limited to this Compose project.
ps_project() {
    docker ps --filter "label=com.docker.compose.project=$PROJECT" "$@" 2>/dev/null
}

PROJECT="$(project_name)"

############################################################################
####  Preflight
############################################################################

[[ -d "$DEMO" ]] || die "no demo/ directory under $ROOT"

say "Checking Docker"
run make -C "$DEMO" check-docker || die "Docker is not usable; start Docker Desktop and retry"

# The LocalNet compose file hard-fails on an unset PARTY_HINT (`${PARTY_HINT:?...}`), so
# even the teardown needs demo/.env.local to exist. `make build` would generate it, but
# that runs too late -- the teardown comes first.
if ! grep -qE '^[[:space:]]*PARTY_HINT=.+' "$DEMO/.env.local" 2>/dev/null; then
    say "Configuring demo/.env.local (first run)"
    note "PARTY_HINT is unset and the LocalNet compose files will not load without it"
    run make -C "$DEMO" setup || die "make setup failed"
    if [[ $DRY_RUN -eq 0 ]] && ! grep -qE '^[[:space:]]*PARTY_HINT=.+' "$DEMO/.env.local" 2>/dev/null; then
        die "setup did not produce a PARTY_HINT in demo/.env.local"
    fi
    PROJECT="$(project_name)"
fi

############################################################################
####  Decide: incremental or full
############################################################################

# Read-only, so it runs under --dry-run too: the whole point of the dry run is to show
# which branch a real run would take.
RUNNING_COUNT="$(ps_project -q | wc -l | tr -d ' ')"

CONFIG_NOW=''
FULL_REASON=''

if [[ $FRESH -eq 1 ]]; then
    FULL_REASON="asked for on the command line"
elif [[ $RUNNING_COUNT -eq 0 ]]; then
    FULL_REASON="nothing is running yet"
elif [[ -f "$STAMP" ]]; then
    say "Checking what changed"
    CONFIG_NOW="$(fp_config)"
    if [[ "$CONFIG_NOW" != "$(stamp_get config)" ]]; then
        FULL_REASON="the resolved Compose config changed (.env, profiles, images or wiring)"
    fi
fi
# A missing stamp is not a reason to tear anything down. The build below still reveals
# which artifacts the working tree actually moves, and that covers the ordinary case of
# editing sources and re-running. What it cannot cover is a Compose config edited while
# the stack was running, so say so rather than silently ignoring the possibility.
if [[ ! -f "$STAMP" && $RUNNING_COUNT -gt 0 && $FRESH -eq 0 ]]; then
    say "Checking what changed"
    note "no $STAMP yet, so this run compares the build's own before/after state"
    note "if you edited demo/.env* while the stack was running, re-run with --fresh"
fi

MODE=incremental
[[ -n "$FULL_REASON" ]] && MODE=full

############################################################################
####  Teardown (full mode only)
############################################################################

if [[ $MODE == full ]]; then
    if [[ $DO_START -eq 0 ]]; then
        say "Stopping the stack"
    else
        say "Full restart: $FULL_REASON"
    fi

    if [[ $RUNNING_COUNT -gt 0 || $DRY_RUN -eq 1 || $DO_START -eq 0 ]]; then
        note "stopping everything in Compose project '$PROJECT'"

        # OBSERVABILITY_ENABLED is forced on for the teardown only. If the last run had
        # observability enabled and .env.local has since turned it off, those containers
        # are no longer in the compose file set and `down` would leave them behind.
        if [[ $CLEAN -eq 1 ]]; then
            run make -C "$DEMO" OBSERVABILITY_ENABLED=true clean-docker \
                || warn "compose down failed; falling back to removing containers by label"
        else
            run make -C "$DEMO" OBSERVABILITY_ENABLED=true stop \
                || warn "compose down failed; falling back to removing containers by label"
        fi

        # Whatever `down` declined to remove: orphans from a previous AUTH_MODE, and
        # `compose run` leftovers such as canton-console or the Daml shell. Matching on the
        # project label keeps this to our own containers -- other checkouts are untouched.
        if [[ $DRY_RUN -eq 0 ]]; then
            STRAGGLERS=()
            while IFS= read -r cid; do [[ -n "$cid" ]] && STRAGGLERS+=("$cid"); done \
                < <(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null)
            if [[ ${#STRAGGLERS[@]} -gt 0 ]]; then
                note "removing ${#STRAGGLERS[@]} leftover container(s) that survived compose down"
                run docker rm -f "${STRAGGLERS[@]}" >/dev/null || warn "could not remove some containers"
            fi
        else
            note "(dry run) would remove any container labelled com.docker.compose.project=$PROJECT"
        fi

        if [[ $CLEAN -eq 1 ]]; then
            # `down -v` only removes volumes declared in the current file set; a volume left
            # by an earlier configuration keeps its project prefix, so sweep on that instead.
            VOLUMES=()
            if [[ $DRY_RUN -eq 0 ]]; then
                while IFS= read -r v; do [[ -n "$v" ]] && VOLUMES+=("$v"); done \
                    < <(docker volume ls -q --filter "name=^${PROJECT}_" 2>/dev/null)
            fi
            if [[ ${#VOLUMES[@]} -gt 0 ]]; then
                note "deleting volumes (this wipes the ledger): ${VOLUMES[*]}"
                run docker volume rm "${VOLUMES[@]}" >/dev/null || warn "could not remove some volumes"
            elif [[ $DRY_RUN -eq 1 ]]; then
                note "(dry run) would delete volumes matching ^${PROJECT}_"
            fi
        fi
    else
        note "nothing running to stop"
    fi
fi

if [[ $DO_START -eq 0 ]]; then
    if [[ $DRY_RUN -eq 1 ]]; then
        printf '\n%sDry run complete -- nothing was stopped.%s\n' "$DIM" "$RESET"
    else
        # The stamp describes a running stack; there is no longer one.
        rm -f "$STAMP"
        printf '\n%sStack stopped.%s\n' "$GREEN" "$RESET"
    fi
    exit 0
fi

############################################################################
####  Build
############################################################################

BACKEND_PRE=''; FRONTEND_PRE=''; DAML_PRE=''

if [[ $MODE == incremental ]]; then
    # Snapshot before building so the build itself reports what moved. Gradle, npm and
    # dpm are incremental, and all three fingerprints are content-based, so an untouched
    # tier comes out byte-identical even when the tool rewrites the file -- which vite
    # does on every run. No guessing about which sources feed which container.
    BACKEND_PRE="$(fp_file "$BACKEND_TAR")"
    FRONTEND_PRE="$(fp_dir "$FRONTEND_DIST")"
    DAML_PRE="$(fp_file "$DAML_DAR")"

    if [[ $DO_BUILD -eq 1 ]]; then
        say "Building (incremental)"
        run make -C "$DEMO" build || die "build failed"
    fi
fi

############################################################################
####  Full: build and start in one go
############################################################################

RESTARTED=()
UNCHANGED=()

if [[ $MODE == full ]]; then
    if [[ $DO_BUILD -eq 1 ]]; then
        say "Building and starting"
        note "first run pulls the Splice and Canton images; expect this to take a while"
        # `start` depends on `build`, so this is one invocation, not a build followed by a
        # separate up that rebuilds.
        run make -C "$DEMO" start || die "build/start failed"
    else
        say "Starting without rebuilding"
        # -o build marks the build target as up to date so only start's own recipe runs.
        run make -C "$DEMO" -o build start || die "start failed"
    fi
    RESTARTED=("everything")
else

############################################################################
####  Incremental: restart only what changed
############################################################################

    BACKEND_NOW="$(fp_file "$BACKEND_TAR")"
    FRONTEND_NOW="$(fp_dir "$FRONTEND_DIST")"
    DAML_NOW="$(fp_file "$DAML_DAR")"

    # Two independent ways for an artifact to be stale, because either alone has a gap.
    # Before/after catches the ordinary case -- sources edited, this run rebuilt them --
    # and works with no stamp at all. The stamp catches an artifact rebuilt out of band
    # since the last run, where before and after are identical but the container is still
    # holding the previous one.
    changed_since() {
        local now="$1" pre="$2" key="$3" recorded
        [[ "$now" != "$pre" ]] && return 0
        [[ -f "$STAMP" ]] || return 1
        recorded="$(stamp_get "$key")"
        [[ -n "$recorded" && "$now" != "$recorded" ]]
    }

    backend_changed=0;  changed_since "$BACKEND_NOW"  "$BACKEND_PRE"  backend  && backend_changed=1
    frontend_changed=0; changed_since "$FRONTEND_NOW" "$FRONTEND_PRE" frontend && frontend_changed=1
    daml_changed=0;     changed_since "$DAML_NOW"     "$DAML_PRE"     daml     && daml_changed=1

    [[ $backend_changed  -eq 1 ]] && note "backend.tar changed"     || UNCHANGED+=("backend")
    [[ $frontend_changed -eq 1 ]] && note "frontend/dist changed"   || UNCHANGED+=("frontend")
    [[ $daml_changed     -eq 1 ]] && note "the DAR changed"         || UNCHANGED+=("daml")

    # Containers that are broken regardless of whether their inputs moved. A one-shot
    # sitting at exit 0 (register-app-user-tenant) is finished, not broken, so only
    # non-zero exits and failed health checks count.
    BROKEN=()
    while IFS= read -r svc; do [[ -n "$svc" ]] && BROKEN+=("$svc"); done < <(
        docker ps -a --filter "label=com.docker.compose.project=$PROJECT" \
            --format '{{.Label "com.docker.compose.service"}}|{{.Status}}' 2>/dev/null \
            | grep -E '\|(Exited \([1-9][0-9]*\)|.*\(unhealthy\))' | cut -d'|' -f1 | sort -u
    )
    [[ ${#BROKEN[@]} -gt 0 ]] && note "unhealthy or crashed: ${BROKEN[*]}"

    # Order matters. splice-onboarding re-uploads the DAR, and the backend has to come up
    # against the new one; register-app-user-tenant is pulled in by restart-backend.
    if [[ $daml_changed -eq 1 ]]; then
        say "Reloading the Daml model (recreating splice-onboarding re-uploads the DAR)"
        run make -C "$DEMO" restart-service SERVICE=splice-onboarding || die "could not restart splice-onboarding"
        RESTARTED+=("splice-onboarding")
    fi

    if [[ $backend_changed -eq 1 || $daml_changed -eq 1 ]]; then
        say "Restarting the backend"
        # -o build-backend: the build above already ran, and restart-backend would
        # otherwise invoke Gradle a second time.
        run make -C "$DEMO" -o build-backend restart-backend || die "could not restart the backend"
        RESTARTED+=("backend-service" "register-app-user-tenant")
    fi

    if [[ $frontend_changed -eq 1 ]]; then
        say "Restarting nginx to pick up the new frontend bundle"
        run make -C "$DEMO" -o build-frontend restart-frontend || die "could not restart nginx"
        RESTARTED+=("nginx")
    fi

    for svc in ${BROKEN[@]+"${BROKEN[@]}"}; do
        case " ${RESTARTED[*]-} " in *" $svc "*) continue ;; esac
        say "Restarting $svc (it was unhealthy or had crashed)"
        run make -C "$DEMO" restart-service SERVICE="$svc" || warn "could not restart $svc"
        RESTARTED+=("$svc")
    done

    # Brings up anything absent without disturbing what is already running: `up -d
    # --no-recreate` starts missing containers and leaves existing ones alone.
    if [[ ${#RESTARTED[@]} -eq 0 ]]; then
        say "Nothing changed -- leaving the stack running"
    else
        say "Filling in anything not running"
        run make -C "$DEMO" -o build start || die "start failed"
    fi
fi

############################################################################
####  Wait for readiness
############################################################################

wait_for_stack() {
    local started=$SECONDS deadline=$((SECONDS + WAIT_SECONDS)) ticks=0 broken state running

    say "Waiting for the stack to come up (timeout ${WAIT_SECONDS}s)"
    note "ready means register-app-user-tenant has exited 0: the backend answered and the tenant registered"

    while (( SECONDS < deadline )); do
        # A non-zero exit anywhere in the project means there is nothing left to wait for.
        # The one-shots (splice-onboarding, register-app-user-tenant) exit 0 on success,
        # so a non-zero code is unambiguous.
        broken="$(docker ps -a --filter "label=com.docker.compose.project=$PROJECT" \
            --format '{{.Names}}  {{.Status}}' 2>/dev/null | grep -E 'Exited \([1-9][0-9]*\)')"
        if [[ -n "$broken" ]]; then
            [[ $TTY -eq 1 ]] && printf '\n'
            printf '%s\n' "$broken" | sed 's/^/    /'
            return 1
        fi

        state="$(docker inspect -f '{{.State.Status}}/{{.State.ExitCode}}' \
            register-app-user-tenant 2>/dev/null)"
        if [[ "$state" == "exited/0" ]]; then
            [[ $TTY -eq 1 ]] && printf '\n'
            return 0
        fi

        running="$(ps_project -q | wc -l | tr -d ' ')"
        if [[ $TTY -eq 1 ]]; then
            printf '\r    %s%s container(s) running, %ss elapsed%s ' \
                "$DIM" "$running" "$((SECONDS - started))" "$RESET"
        elif (( ticks % 12 == 0 )); then
            printf '    %s container(s) running, %ss elapsed\n' "$running" "$((SECONDS - started))"
        fi
        ticks=$((ticks + 1))
        sleep 5
    done

    [[ $TTY -eq 1 ]] && printf '\n'
    return 2
}

READY=1
if [[ ${#RESTARTED[@]} -eq 0 && $MODE == incremental ]]; then
    # Nothing was touched, so whatever state the stack was in, it is still in.
    READY=0
elif [[ $DO_WAIT -eq 1 && $DRY_RUN -eq 0 ]]; then
    wait_for_stack
    case $? in
        0) READY=0 ;;
        1) printf '\n%sA container exited with an error.%s Logs: cd demo && make logs\n' \
               "$RED" "$RESET" >&2 ;;
        2) warn "not ready after ${WAIT_SECONDS}s; the stack may still be bootstrapping"
           note "follow it with: cd demo && make tail" ;;
    esac
elif [[ $DRY_RUN -eq 1 ]]; then
    note "(dry run) would wait up to ${WAIT_SECONDS}s for register-app-user-tenant to exit 0"
fi

############################################################################
####  Record and report
############################################################################

# Only stamp a stack that came up: a half-started one must not be recorded as the
# baseline, or the next run would consider its stale containers up to date.
if [[ $READY -eq 0 && $DRY_RUN -eq 0 ]]; then
    [[ -n "$CONFIG_NOW" ]] || CONFIG_NOW="$(fp_config)"
    stamp_write "$CONFIG_NOW" \
        "$(fp_file "$BACKEND_TAR")" "$(fp_dir "$FRONTEND_DIST")" "$(fp_file "$DAML_DAR")" \
        || warn "could not write $STAMP; the next run will do a full restart"
fi

say "Container status"
run make -C "$DEMO" status

if [[ $DRY_RUN -eq 1 ]]; then
    printf '\n%sDry run complete -- nothing was stopped, built or started.%s\n' "$DIM" "$RESET"
elif [[ $READY -eq 0 ]]; then
    if [[ ${#RESTARTED[@]} -eq 0 ]]; then
        printf '\n%sStack is up; nothing needed restarting.%s\n' "$GREEN" "$RESET"
    else
        printf '\n%sStack is up.%s restarted: %s\n' "$GREEN" "$RESET" "${RESTARTED[*]}"
    fi
    [[ ${#UNCHANGED[@]} -gt 0 ]] && note "left alone (unchanged): ${UNCHANGED[*]}"
else
    printf '\n%sStack started, readiness not confirmed.%s\n' "$YELLOW" "$RESET"
fi

printf '\n  App UI   http://app-provider.localhost:3000\n'
printf '  All UIs  %s\n' "$PAGE"
printf '\n  Logs: cd demo && make tail        Stop: ./dev.sh --stop\n'

# Open the link page. Backgrounded because xdg-open blocks on some desktops, and the
# stack is already up by this point either way.
if [[ $DO_OPEN -eq 1 && $DRY_RUN -eq 0 ]]; then
    OPENER=''
    case "$(uname -s)" in
        Darwin) command -v open     >/dev/null 2>&1 && OPENER=open ;;
        Linux)  command -v xdg-open >/dev/null 2>&1 && OPENER=xdg-open ;;
    esac
    if [[ ! -f "$PAGE" ]]; then
        warn "dev-links.html not found at $PAGE"
    elif [[ -z "$OPENER" ]]; then
        note "no browser opener on this platform; open $PAGE yourself"
    else
        "$OPENER" "$PAGE" >/dev/null 2>&1 &
    fi
elif [[ $DO_OPEN -eq 1 ]]; then
    note "(dry run) would open $PAGE in a browser"
fi

if [[ $VITE -eq 1 ]]; then
    # Hot reload against the running backend. nginx keeps serving the built bundle on
    # :3000; Vite serves :5173 and proxies /api to the backend on the host.
    say "Starting the Vite dev server -- Ctrl-C stops it, the stack keeps running"
    note "http://app-provider.localhost:5173"
    run make -C "$DEMO" vite-dev
fi
