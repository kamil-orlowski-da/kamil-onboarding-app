// Copyright (c) 2026, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: 0BSD

package com.digitalasset.demo.security.oauth2;

import com.digitalasset.demo.security.Auth;
import com.digitalasset.demo.security.PartyAuthority;
import com.digitalasset.demo.security.TenantAuthority;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Collection;
import java.util.HashSet;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.*;
import org.springframework.security.oauth2.client.oidc.web.logout.OidcClientInitiatedLogoutSuccessHandler;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

@Configuration
@EnableWebSecurity
@Profile("oauth2")
public class OAuth2Config {

  @Value("${application.tenants.AppProvider.partyId}")
  private String partyId;

  @Value("${application.tenants.AppProvider.tenantId}")
  private String tenantId;

  private final OAuth2AuthenticationSuccessHandler authenticationSuccessHandler;
  private final ClientRegistrationRepository clientRegistrationRepository;
  private final OAuth2AuthorizedClientService authorizedClientService;

  public OAuth2Config(
      OAuth2AuthenticationSuccessHandler authenticationSuccessHandler,
      ClientRegistrationRepository clientRegistrationRepository,
      OAuth2AuthorizedClientService authorizedClientService) {
    this.authenticationSuccessHandler = authenticationSuccessHandler;
    this.clientRegistrationRepository = clientRegistrationRepository;
    this.authorizedClientService = authorizedClientService;
  }

  @Bean
  public Auth auth() {
    return Auth.OAUTH2;
  }

  @Bean
  public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http.csrf(
            (csrf) ->
                csrf.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                    .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
                    // The party registrations, which are `permitAll` below. CSRF protection
                    // stops a third-party page from spending a *logged-in* user's authority;
                    // these endpoints borrow no authority, because anyone may call them
                    // directly with curl. So there is nothing to protect here — and requiring
                    // a token would break the case that has to work, a first registration from
                    // a browser that has no session and so no XSRF-TOKEN cookie yet.
                    .ignoringRequestMatchers("/car-dealers", "/leasing-companies", "/customers"))
        .authorizeHttpRequests(
            authorize ->
                authorize
                    // Reporting a failure is not a second thing to authorize. Spring forwards
                    // to /error to render one, which re-enters this chain keeping the original
                    // method — so without this, a 400 or 409 from an unauthenticated POST
                    // (a duplicate party name, say) comes back as a 401 instead.
                    .dispatcherTypeMatchers(DispatcherType.ERROR)
                    .permitAll()
                    .requestMatchers(
                        HttpMethod.GET,
                        "/user",
                        "/login-links",
                        "/feature-flags",
                        "/oauth2/authorization/**")
                    .permitAll()
                    .requestMatchers(HttpMethod.POST, "/logout")
                    .permitAll()
                    // The vehicle leasing party registry, open on purpose: it starts empty, so
                    // putting registration behind a login would deadlock, and a party-picker
                    // has to list who exists before anyone has been picked. A demo affordance
                    // — registering a party is really an administrative act — so do not read
                    // these two lines as a pattern to follow for domain endpoints.
                    .requestMatchers(HttpMethod.GET, "/actors")
                    .permitAll()
                    .requestMatchers(
                        HttpMethod.POST, "/car-dealers", "/leasing-companies", "/customers")
                    .permitAll()
                    .requestMatchers("/admin/**")
                    .hasRole("ADMIN")
                    .anyRequest()
                    .authenticated())
        .exceptionHandling(
            exceptionHandling ->
                exceptionHandling.authenticationEntryPoint(
                    (request, response, authException) -> {
                      response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                      response.getWriter().write("Unauthorized");
                    }))
        .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
        .oauth2Login(
            oauth2 ->
                oauth2.defaultSuccessUrl("/", true).successHandler(authenticationSuccessHandler))
        .logout(
            logout ->
                logout
                    .logoutUrl("/logout")
                    .logoutSuccessHandler(oidcLogoutSuccessHandler())
                    .invalidateHttpSession(true)
                    .clearAuthentication(true)
                    .deleteCookies("JSESSIONID"));
    return http.build();
  }

  @Bean
  public JwtAuthenticationConverter jwtAuthenticationConverter() {
    JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(
        new Converter<>() {
          private final JwtGrantedAuthoritiesConverter defaultGrantedAuthoritiesConverter =
              new JwtGrantedAuthoritiesConverter();

          @Override
          public Collection<GrantedAuthority> convert(Jwt jwt) {
            Collection<GrantedAuthority> authorities =
                new HashSet<>(defaultGrantedAuthoritiesConverter.convert(jwt));
            // there is only one AppProvider issuer that can issue JWT to authenticate to
            // ResourceServer
            // we consider anybody with JWT from that issuer to be admin
            authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
            authorities.add(new PartyAuthority(partyId));
            authorities.add(new TenantAuthority(tenantId));
            return authorities;
          }
        });
    return converter;
  }

  private LogoutSuccessHandler oidcLogoutSuccessHandler() {
    return new OidcClientInitiatedLogoutSuccessHandler(this.clientRegistrationRepository);
  }

  @Bean
  @Primary
  public OAuth2AuthorizedClientManager multiGrantTypeClientManager() {
    OAuth2AuthorizedClientProvider authorizedClientProvider =
        OAuth2AuthorizedClientProviderBuilder.builder()
            .clientCredentials()
            .authorizationCode()
            .refreshToken()
            .build();

    AuthorizedClientServiceOAuth2AuthorizedClientManager authorizedClientManager =
        new AuthorizedClientServiceOAuth2AuthorizedClientManager(
            clientRegistrationRepository, authorizedClientService);

    authorizedClientManager.setAuthorizedClientProvider(authorizedClientProvider);
    return authorizedClientManager;
  }
}
