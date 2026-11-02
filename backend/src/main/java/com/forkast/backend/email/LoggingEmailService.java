package com.forkast.backend.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

/** Everywhere but prod: prints emails to the console instead of sending them. */
@Service
@Profile("!prod")
public class LoggingEmailService implements EmailService {

    private static final Logger log = LoggerFactory.getLogger(LoggingEmailService.class);

    @Override
    public void sendVerificationCode(String to, String firstName, String code) {
        log.info("[EMAIL] To {} | Verify your account, {}: code {}", to, firstName, code);
    }

    @Override
    public void sendPasswordResetCode(String to, String firstName, String code) {
        log.info("[EMAIL] To {} | Password reset for {}: code {}", to, firstName, code);
    }

    @Override
    public void sendEmailChangeCode(String to, String firstName, String code) {
        log.info("[EMAIL] To {} | Confirm your new email, {}: code {}", to, firstName, code);
    }

    @Override
    public void sendEmailChangedNotice(String oldAddress, String firstName, String newAddress) {
        log.info("[EMAIL] To {} | {}, your email was changed to {}", oldAddress, firstName, newAddress);
    }

    @Override
    public void sendPasswordChangedNotice(String to, String firstName) {
        log.info("[EMAIL] To {} | {}, your password was changed", to, firstName);
    }
}