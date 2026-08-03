package com.digitalasset.demo.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AuthConfig {
    private final AuthenticatedPartyProvider authenticatedPartyProvider;
    private final Auth auth;

    public AuthConfig(AuthenticatedPartyProvider authenticatedPartyProvider, Auth auth) {
        this.authenticatedPartyProvider = authenticatedPartyProvider;
        this.auth = auth;
    }

    @Bean
    public AuthUtils authUtils() {
        return new AuthUtils(authenticatedPartyProvider, auth);
    }
}
