package com.digitalasset.quickstart.service;

import com.digitalasset.quickstart.api.ActorsApi;
import com.digitalasset.quickstart.registry.PartyRegistry;
import io.opentelemetry.instrumentation.annotations.WithSpan;
import org.openapitools.model.Actor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

import java.util.List;
import java.util.concurrent.CompletableFuture;

import static com.digitalasset.quickstart.service.ServiceUtils.traceServiceCallAsync;
import static com.digitalasset.quickstart.utility.TracingUtils.tracingCtx;

/**
 * The one registry read: everybody, whatever their role.
 *
 * <p>Unauthenticated, and not scoped to an acting party — a party-picker has to list who exists
 * before anyone has been picked. See {@code PartyRegistry} for why that is a property of the demo
 * rather than a pattern to carry forward.
 */
@Controller
@RequestMapping("${openapi.asset.base-path:}")
public class ActorsApiImpl implements ActorsApi {
    private static final Logger logger = LoggerFactory.getLogger(ActorsApiImpl.class);
    private final PartyRegistry registry;

    @Autowired
    public ActorsApiImpl(PartyRegistry registry) {
        this.registry = registry;
    }

    @Override
    @WithSpan
    public CompletableFuture<ResponseEntity<List<Actor>>> listActors() {
        var ctx = tracingCtx(logger, "listActors");
        return traceServiceCallAsync(ctx, () ->
                CompletableFuture.supplyAsync(() -> ResponseEntity.ok(registry.listActors())));
    }
}
