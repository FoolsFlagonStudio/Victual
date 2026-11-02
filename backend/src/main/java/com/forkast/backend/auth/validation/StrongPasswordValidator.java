package com.forkast.backend.auth.validation;

import java.util.Locale;
import java.util.Set;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/** The rules behind @StrongPassword, also used directly by tests. */
public class StrongPasswordValidator implements ConstraintValidator<StrongPassword, String> {

    public static final int MIN = 8;
    public static final int MAX = 72;

    /** Words that make a weak password however they're dressed up ("P@ssword1"). */
    private static final Set<String> COMMON = Set.of("password", "passw", "qwerty", "qwertyuiop", "letmein",
            "welcome", "admin", "iloveyou", "monkey", "dragon", "football", "baseball", "sunshine", "princess",
            "abc", "abcd", "abcdef", "test", "login", "victual", "forkast");

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        String problem = value == null ? null : problem(value);
        if (problem == null) {
            return true;
        }
        // The rule message covers length and character kinds; these two need their own.
        String message = switch (problem) {
            case "common" -> "is too easy to guess; try something less common";
            case "spaces" -> "can't start or end with a space";
            default -> null;
        };
        if (message != null && context != null) {
            context.disableDefaultConstraintViolation();
            context.buildConstraintViolationWithTemplate(message).addConstraintViolation();
        }
        return false;
    }

    /** What's wrong with a password, or null when it's fine. */
    public static String problem(String password) {
        if (password.length() < MIN || password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX) {
            return "length";
        }
        if (password.chars().noneMatch(Character::isUpperCase)) {
            return "uppercase";
        }
        if (password.chars().noneMatch(Character::isLowerCase)) {
            return "lowercase";
        }
        if (password.chars().noneMatch(Character::isDigit)) {
            return "number";
        }
        if (password.chars().allMatch(Character::isLetterOrDigit)) {
            return "symbol";
        }
        if (password.isBlank() || !password.strip().equals(password)) {
            return "spaces";
        }
        // Built on a common word, with numbers and symbols around it or swapped in:
        // "Password1!", "P@ssw0rd!23", "Victual2026!".
        String lower = password.toLowerCase(Locale.ROOT);
        String letters = lower.replaceAll("[^a-z]", "");
        String unswapped = lower.replace('@', 'a').replace('0', 'o').replace('1', 'l').replace('3', 'e')
                .replace('$', 's').replaceAll("[^a-z]", "");
        boolean common = COMMON.contains(letters) || COMMON.contains(unswapped)
                || COMMON.stream().filter(w -> w.length() >= 5).anyMatch(w -> letters.contains(w) || unswapped.contains(w))
                || letters.matches("(.)\\1*");
        if (common) {
            return "common";
        }
        return null;
    }
}
