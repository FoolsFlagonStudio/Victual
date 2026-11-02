package com.forkast.backend.email;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Sending real email (prod). apiKey is a Resend API key; from must use a domain verified in
 * Resend, e.g. "Victual <hello@mail.example.com>". Unused outside prod.
 */
@ConfigurationProperties(prefix = "forkast.email")
public record EmailProperties(
        String apiKey,
        String from,
        @DefaultValue("https://api.resend.com") String baseUrl) {
}
