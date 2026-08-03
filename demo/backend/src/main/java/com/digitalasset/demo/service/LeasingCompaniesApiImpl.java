package com.digitalasset.demo.service;

import com.digitalasset.demo.api.LeasingCompaniesApi;
import com.digitalasset.demo.registry.PartyRegistry;
import io.opentelemetry.instrumentation.annotations.WithSpan;
import org.openapitools.model.Actor;
import org.openapitools.model.CreateLeasingCompanyRequest;
import org.openapitools.model.LeasingCompany;
import org.openapitools.model.Role;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

import java.util.concurrent.CompletableFuture;

import static com.digitalasset.demo.service.PartyRequests.partyName;
import static com.digitalasset.demo.service.PartyRequests.requestedParty;
import static com.digitalasset.demo.service.ServiceUtils.traceServiceCallAsync;
import static com.digitalasset.demo.utility.TracingUtils.tracingCtx;

/** Registers the party that finances the vehicle and administers the lease. */
@Controller
@RequestMapping("${openapi.asset.base-path:}")
public class LeasingCompaniesApiImpl implements LeasingCompaniesApi {
    private static final Logger logger = LoggerFactory.getLogger(LeasingCompaniesApiImpl.class);
    private final PartyRegistry registry;

    @Autowired
    public LeasingCompaniesApiImpl(PartyRegistry registry) {
        this.registry = registry;
    }

    @Override
    @WithSpan
    public CompletableFuture<ResponseEntity<LeasingCompany>> createLeasingCompany(CreateLeasingCompanyRequest request) {
        var ctx = tracingCtx(logger, "createLeasingCompany", "name", request.getName());
        return traceServiceCallAsync(ctx, () -> CompletableFuture.supplyAsync(() -> {
            Actor actor = registry.register(
                    Role.LEASING_COMPANY, partyName(request.getName()), requestedParty(request.getParty()));
            return ResponseEntity.status(HttpStatus.CREATED).body(new LeasingCompany(
                    actor.getParty(), actor.getRole(), actor.getName(), actor.getCreatedAt()));
        }));
    }
}
