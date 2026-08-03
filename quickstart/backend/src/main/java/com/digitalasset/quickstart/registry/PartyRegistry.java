package com.digitalasset.quickstart.registry;

import org.openapitools.model.Actor;
import org.openapitools.model.Role;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Repository;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Who exists in the vehicle leasing workflow, and what part they play.
 *
 * <p>Identity is not domain state: on a real deployment these entries come from an identity
 * provider, and registering one is an administrative act rather than a business operation.
 * It lives in its own package so that move touches this file and nothing else.
 *
 * <p>Reads are deliberately not scoped to an acting party — a screen has to list who exists
 * before anyone has been picked, and the registry may be read before anybody is authenticated
 * at all (see the {@code permitAll} entries in {@code OAuth2Config} and
 * {@code SharedSecretConfig}).
 *
 * <p>State is per-process and lost on restart — by design. A leasing role is not a ledger
 * contract, and nothing here reaches Canton or PQS; contrast {@code DamlRepository}, which
 * reads state that outlives the process.
 */
@Repository
public class PartyRegistry {

    /**
     * Every party, by id. One map rather than one per role: nothing here ever reads a single
     * role's parties, and ids are unique across all three anyway.
     */
    private final Map<String, Actor> parties = new ConcurrentHashMap<>();

    /** {@code nameKey} to the id it was given, so a duplicate name is recognised as one. */
    private final Map<String, String> partiesByName = new ConcurrentHashMap<>();

    private static final Pattern NON_SLUGGABLE = Pattern.compile("[^a-z0-9]+");
    private static final Pattern LEADING_TRAILING_DASH = Pattern.compile("^-+|-+$");
    private static final Pattern WHITESPACE_RUN = Pattern.compile("\\s+");

    /** Every party, flattened to what a party-picker needs. */
    public List<Actor> listActors() {
        // Projected field by field, not returned as stored: a no-op today, but it stops a
        // role-specific field added later from silently leaking into this response.
        return parties.values().stream()
                .map(actor -> new Actor(
                        actor.getParty(),
                        actor.getRole(),
                        actor.getName(),
                        actor.getCreatedAt()))
                .sorted(Comparator.comparing(Actor::getName, String::compareToIgnoreCase))
                .toList();
    }

    /** The party an id names, or empty if there is no such party. */
    public Optional<Actor> find(String party) {
        return party == null ? Optional.empty() : Optional.ofNullable(parties.get(party));
    }

    /**
     * The leasing role a party plays, if it has been registered. Empty is an ordinary answer,
     * not a failure: authentication and registration are separate, so a logged-in party may
     * have no leasing role at all.
     */
    public Optional<Role> roleOf(String party) {
        return find(party).map(Actor::getRole);
    }

    /**
     * Registers a party in a role.
     *
     * <p>The three roles add no fields of their own, so one method builds all three. Give a
     * role a field of its own and this splits back into three.
     *
     * @param party an existing party id to attach the role to, or null to derive one from the
     *              name. A derived id belongs to no ledger party, so only a given one can ever
     *              be recognised as the caller later (see {@code UserApiImpl}).
     * @throws ResponseStatusException 409 if that name is already registered in that role, or
     *                                 if the given party already has a leasing role
     */
    public Actor register(Role role, String name, String party) {
        String trimmed = name.trim();
        Actor actor = new Actor(
                claim(role, trimmed, party), role, trimmed, OffsetDateTime.now(ZoneOffset.UTC));
        parties.put(actor.getParty(), actor);
        return actor;
    }

    /**
     * Reserves an id for a name, or rejects if that name is already registered in the role.
     *
     * <p>Two steps, because the two questions are different: the name decides whether this is a
     * duplicate, the slug only decides what the id looks like. A distinct name whose slug is
     * already spoken for gets a suffix rather than a 409.
     *
     * <p>Synchronized so that the check and the claim cannot interleave with another request's:
     * the maps are individually thread-safe, but "reject if taken, otherwise take it" spans
     * both of them and is not.
     */
    private synchronized String claim(Role role, String name, String requestedParty) {
        String key = nameKey(role, name);
        if (partiesByName.containsKey(key)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    String.format("A %s named \"%s\" already exists", role.getValue(), name));
        }

        String party;
        if (requestedParty != null) {
            // Taken as given, suffixed with nothing: the point of naming a party is to be *that*
            // party, and `party-2` would silently be somebody else. One leasing role per party,
            // so a second one is a 409 rather than a role swap.
            party = requestedParty;
            if (parties.containsKey(party)) {
                Actor existing = parties.get(party);
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        String.format("Party %s is already registered as %s \"%s\"",
                                party, existing.getRole().getValue(), existing.getName()));
            }
        } else {
            String base = role.getValue() + "::" + slug(name);
            party = base;
            for (int suffix = 2; parties.containsKey(party); suffix++) {
                party = base + "-" + suffix;
            }
        }

        partiesByName.put(key, party);
        return party;
    }

    /**
     * The readable part of {@code CarDealer::acme-motors}. Derived from the name rather than
     * random so the id shows up legibly in a {@code curl}.
     *
     * <p>Lossy — everything but ASCII alphanumerics collapses to {@code -} — so it cannot carry
     * uniqueness on its own: "Acme Motors" and "Acme-Motors" slug alike. {@code nameKey}
     * decides what counts as a duplicate; {@code claim} disambiguates the id.
     */
    private static String slug(String name) {
        String slugged = LEADING_TRAILING_DASH
                .matcher(NON_SLUGGABLE.matcher(name.toLowerCase()).replaceAll("-"))
                .replaceAll("");
        return slugged.isEmpty() ? "unnamed" : slugged;
    }

    /**
     * What counts as the same name within a role: case- and whitespace-insensitive, but
     * otherwise the name as given. Two genuinely different names never share a key, so a 409
     * always means the name really is taken.
     */
    private static String nameKey(Role role, String name) {
        return role.getValue() + "::"
                + WHITESPACE_RUN.matcher(name.trim()).replaceAll(" ").toLowerCase();
    }
}
