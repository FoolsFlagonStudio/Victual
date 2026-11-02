package com.forkast.backend.email;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

/**
 * Sends email through Resend's HTTP API (prod). HTTPS rather than SMTP because Render's free
 * instances block outbound SMTP ports. Uses the JDK's HttpClient, so no extra dependency.
 *
 * A failed send throws: the caller (sign-up, password reset) should fail loudly rather than
 * leave someone waiting for a code that never arrives.
 */
@Service
@Profile("prod")
public class ResendEmailService implements EmailService {

    private static final Logger log = LoggerFactory.getLogger(ResendEmailService.class);

    private final EmailProperties properties;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public ResendEmailService(EmailProperties properties) {
        if (properties.apiKey() == null || properties.apiKey().isBlank()
                || properties.from() == null || properties.from().isBlank()) {
            throw new IllegalStateException("forkast.email.api-key and forkast.email.from are required in prod");
        }
        this.properties = properties;
    }

    @Override
    public void sendVerificationCode(String to, String firstName, String code) {
        send(to, "Your Victual verification code: " + code,
                "Hi " + firstName + ",",
                "Your verification code is:", code,
                "It expires in 15 minutes. If you didn't sign up for Victual, you can ignore this email.");
    }

    @Override
    public void sendPasswordResetCode(String to, String firstName, String code) {
        send(to, "Your Victual password reset code: " + code,
                "Hi " + firstName + ",",
                "Use this code to reset your password:", code,
                "It expires in 15 minutes. If you didn't ask to reset your password, you can ignore this email.");
    }

    @Override
    public void sendEmailChangeCode(String to, String firstName, String code) {
        send(to, "Confirm your new Victual email: " + code,
                "Hi " + firstName + ",",
                "Use this code to confirm this as your new email address:", code,
                "It expires in 15 minutes.");
    }

    @Override
    public void sendEmailChangedNotice(String oldAddress, String firstName, String newAddress) {
        send(oldAddress, "Your Victual email was changed",
                "Hi " + firstName + ",",
                "The email on your Victual account was changed to " + newAddress + ".", null,
                "If this wasn't you, reply to this email right away.");
    }

    @Override
    public void sendPasswordChangedNotice(String to, String firstName) {
        send(to, "Your Victual password was changed",
                "Hi " + firstName + ",",
                "The password on your Victual account was just changed.", null,
                "If this wasn't you, reset your password from the app and reply to this email.");
    }

    // ---------- sending ----------

    private void send(String to, String subject, String greeting, String lead, String code, String footer) {
        String text = String.join("\n\n", nonNull(greeting, lead, code, footer));
        String html = "<div style=\"font-family:Arial,sans-serif;color:#3D2433;font-size:16px;line-height:1.5\">"
                + "<p>" + escape(greeting) + "</p><p>" + escape(lead) + "</p>"
                + (code == null ? "" : "<p style=\"font-size:28px;font-weight:bold;letter-spacing:4px\">"
                        + escape(code) + "</p>")
                + "<p style=\"color:#6b5a63;font-size:14px\">" + escape(footer) + "</p></div>";
        String body = "{" + field("from", properties.from()) + "," + "\"to\":[" + json(to) + "],"
                + field("subject", subject) + "," + field("text", text) + "," + field("html", html) + "}";

        HttpRequest request = HttpRequest.newBuilder(URI.create(properties.baseUrl() + "/emails"))
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", "Bearer " + properties.apiKey())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 300) {
                throw new IllegalStateException("Resend returned " + response.statusCode() + ": "
                        + response.body().substring(0, Math.min(300, response.body().length())));
            }
            log.info("Sent \"{}\" email", subject.replaceAll(": .*", ""));  // never log the code
        } catch (IOException e) {
            throw new IllegalStateException("Couldn't reach Resend", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted sending email", e);
        }
    }

    private static List<String> nonNull(String... parts) {
        return java.util.Arrays.stream(parts).filter(p -> p != null).toList();
    }

    private static String field(String name, String value) {
        return json(name) + ":" + json(value);
    }

    /** A JSON string literal. */
    static String json(String value) {
        StringBuilder out = new StringBuilder("\"");
        for (char c : value.toCharArray()) {
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        return out.append('"').toString();
    }

    static String escape(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
