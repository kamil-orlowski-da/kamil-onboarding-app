package com.digitalasset.demo.service;

import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * What the party registration endpoints accept as a name.
 *
 * <p>Bean Validation on the generated request models already rejects a missing {@code name}; this
 * covers the rest, so a bad body comes back as a 400 naming the rule rather than reaching the
 * registry and turning into a surprising id.
 */
final class PartyRequests {

  /** At least one ASCII letter or digit, so {@code slug} has something to work with. */
  private static final Pattern SLUGGABLE = Pattern.compile(".*[a-zA-Z0-9].*", Pattern.DOTALL);

  private PartyRequests() {}

  /**
   * The name to register, or a 400.
   *
   * <p>The registry slugs the name into the party id, so a name with nothing sluggable in it slugs
   * to nothing. Rejecting it here gives a 400 rather than {@code CarDealer::unnamed}.
   *
   * <p>ASCII on purpose: this is a demo, and names in other scripts are out of scope. The cost is
   * that "Żółć" is a 400 — widen this and the registry's {@code slug} together, to {@code
   * \p{IsAlphabetic}}/{@code \p{IsDigit}}, if that ever needs to work.
   */
  static String partyName(String name) {
    if (name == null || name.isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name must be a non-empty string");
    }
    if (!SLUGGABLE.matcher(name).matches()) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "name must contain at least one ASCII letter or digit");
    }
    return name;
  }

  /**
   * The party id to attach the role to, or null to let the registry derive one.
   *
   * <p>Blank counts as absent rather than as an error: a form that submits an untouched optional
   * field should register a party, not fail. Not otherwise validated — whether a party exists on
   * the ledger is Canton's to answer, and a registry entry for a party that does not exist simply
   * never matches anyone.
   */
  static String requestedParty(String party) {
    return party == null || party.isBlank() ? null : party.trim();
  }
}
