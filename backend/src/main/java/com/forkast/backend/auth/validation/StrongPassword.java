package com.forkast.backend.auth.validation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * A new password: 8 to 72 characters (bcrypt reads at most 72 bytes) with an
 * uppercase letter, a lowercase letter, a number and a symbol, and not built on a
 * common password ("Password1!"). Null passes, so pair it with @NotBlank.
 * Checked on signup, reset and change; logging in with an older, weaker password
 * still works.
 */
@Documented
@Constraint(validatedBy = StrongPasswordValidator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface StrongPassword {

    String message() default "must be 8 to 72 characters with an uppercase letter, a lowercase letter, a number and a symbol";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
