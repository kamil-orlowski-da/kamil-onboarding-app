package com.digitalasset.demo.security;

public interface TokenProvider {
    /**
     * Get the JWT token for backend channels.
     */
    String getToken();
}
