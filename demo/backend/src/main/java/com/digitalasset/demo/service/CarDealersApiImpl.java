package com.digitalasset.demo.service;

import static com.digitalasset.demo.service.PartyRequests.partyName;
import static com.digitalasset.demo.service.PartyRequests.requestedParty;
import static com.digitalasset.demo.service.ServiceUtils.traceServiceCallAsync;
import static com.digitalasset.demo.utility.TracingUtils.tracingCtx;

import com.digitalasset.demo.api.CarDealersApi;
import com.digitalasset.demo.registry.PartyRegistry;
import io.opentelemetry.instrumentation.annotations.WithSpan;
import java.util.concurrent.CompletableFuture;
import org.openapitools.model.Actor;
import org.openapitools.model.CarDealer;
import org.openapitools.model.CreateCarDealerRequest;
import org.openapitools.model.Role;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

/**
 * Registers the party that supplies the vehicle.
 *
 * <p>One impl per role even though the three are identical: the endpoints are separate, and a
 * dealer-specific field later goes here without disturbing the other two.
 */
@Controller
@RequestMapping("${openapi.asset.base-path:}")
public class CarDealersApiImpl implements CarDealersApi {
  private static final Logger logger = LoggerFactory.getLogger(CarDealersApiImpl.class);
  private final PartyRegistry registry;

  @Autowired
  public CarDealersApiImpl(PartyRegistry registry) {
    this.registry = registry;
  }

  @Override
  @WithSpan
  public CompletableFuture<ResponseEntity<CarDealer>> createCarDealer(
      CreateCarDealerRequest request) {
    var ctx = tracingCtx(logger, "createCarDealer", "name", request.getName());
    return traceServiceCallAsync(
        ctx,
        () ->
            CompletableFuture.supplyAsync(
                () -> {
                  // A duplicate name in this role is a 409 from the registry: the name is what the
                  // party id is derived from, so registering it twice would mean two dealers whose
                  // ids differ only by a suffix.
                  Actor actor =
                      registry.register(
                          Role.CAR_DEALER,
                          partyName(request.getName()),
                          requestedParty(request.getParty()));
                  return ResponseEntity.status(HttpStatus.CREATED)
                      .body(
                          new CarDealer(
                              actor.getParty(),
                              actor.getRole(),
                              actor.getName(),
                              actor.getCreatedAt()));
                }));
  }
}
