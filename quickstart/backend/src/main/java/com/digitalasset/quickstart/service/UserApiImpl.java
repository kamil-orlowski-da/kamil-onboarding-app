// Copyright (c) 2026, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: 0BSD
package com.digitalasset.quickstart.service;

import com.digitalasset.quickstart.api.UserApi;
import com.digitalasset.quickstart.registry.PartyRegistry;
import com.digitalasset.quickstart.security.AuthenticatedUserProvider;
import com.digitalasset.quickstart.repository.TenantPropertiesRepository;
import com.digitalasset.quickstart.repository.TenantPropertiesRepository.TenantProperties;
import io.opentelemetry.instrumentation.annotations.WithSpan;
import org.openapitools.model.AuthenticatedUser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

import java.util.Optional;
import java.util.concurrent.CompletableFuture;

@Controller
@RequestMapping("${openapi.asset.base-path:}")
public class UserApiImpl implements UserApi {
    private final TenantPropertiesRepository tenantPropertiesRepository;
    private final AuthenticatedUserProvider authenticatedUserProvider;
    private final PartyRegistry partyRegistry;

    @Autowired
    public UserApiImpl(TenantPropertiesRepository tenantPropertiesRepository, AuthenticatedUserProvider authenticatedUserProvider, PartyRegistry partyRegistry) {
        this.tenantPropertiesRepository = tenantPropertiesRepository;
        this.authenticatedUserProvider = authenticatedUserProvider;
        this.partyRegistry = partyRegistry;
    }

    @Override
    @WithSpan
    public CompletableFuture<ResponseEntity<AuthenticatedUser>> getAuthenticatedUser() {
        return CompletableFuture.completedFuture(authenticatedUserProvider.getUser()).thenApply(maybeUser ->
                maybeUser.map(user -> {
                            // Lookup wallet URL from tenant properties
                            String walletUrl = Optional.ofNullable(tenantPropertiesRepository.getTenant(user.tenantId()))
                                    .map(TenantProperties::getWalletUrl)
                                    .orElse(null);
                            // Create the AuthenticatedUser object
                            AuthenticatedUser out = new AuthenticatedUser(
                                    user.username(),
                                    user.partyId(),
                                    user.roles(),
                                    user.isAdmin(),
                                    walletUrl
                            );
                            // Which part this party plays in the leasing workflow, if anyone has
                            // registered it. Left null when nobody has: authentication and
                            // registration are separate, so being logged in says nothing about
                            // having a leasing role. A display hint only — every endpoint
                            // re-checks regardless of what the frontend rendered.
                            partyRegistry.roleOf(user.partyId()).ifPresent(out::setLeasingRole);
                            // Return the AuthenticatedUser in the response
                            return ResponseEntity.ok(out);
                        })
                        .orElse(ResponseEntity.status(HttpStatus.UNAUTHORIZED).build())
        );
    }
}
