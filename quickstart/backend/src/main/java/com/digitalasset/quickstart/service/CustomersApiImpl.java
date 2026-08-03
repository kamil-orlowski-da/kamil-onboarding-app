package com.digitalasset.quickstart.service;

import com.digitalasset.quickstart.api.CustomersApi;
import com.digitalasset.quickstart.registry.PartyRegistry;
import io.opentelemetry.instrumentation.annotations.WithSpan;
import org.openapitools.model.Actor;
import org.openapitools.model.CreateCustomerRequest;
import org.openapitools.model.Customer;
import org.openapitools.model.Role;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

import java.util.concurrent.CompletableFuture;

import static com.digitalasset.quickstart.service.PartyRequests.partyName;
import static com.digitalasset.quickstart.service.PartyRequests.requestedParty;
import static com.digitalasset.quickstart.service.ServiceUtils.traceServiceCallAsync;
import static com.digitalasset.quickstart.utility.TracingUtils.tracingCtx;

/** Registers the party that leases the vehicle. */
@Controller
@RequestMapping("${openapi.asset.base-path:}")
public class CustomersApiImpl implements CustomersApi {
    private static final Logger logger = LoggerFactory.getLogger(CustomersApiImpl.class);
    private final PartyRegistry registry;

    @Autowired
    public CustomersApiImpl(PartyRegistry registry) {
        this.registry = registry;
    }

    @Override
    @WithSpan
    public CompletableFuture<ResponseEntity<Customer>> createCustomer(CreateCustomerRequest request) {
        var ctx = tracingCtx(logger, "createCustomer", "name", request.getName());
        return traceServiceCallAsync(ctx, () -> CompletableFuture.supplyAsync(() -> {
            Actor actor = registry.register(
                    Role.CUSTOMER, partyName(request.getName()), requestedParty(request.getParty()));
            return ResponseEntity.status(HttpStatus.CREATED).body(new Customer(
                    actor.getParty(), actor.getRole(), actor.getName(), actor.getCreatedAt()));
        }));
    }
}
