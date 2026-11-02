package com.forkast.backend.auth.validation;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class StrongPasswordValidatorTest {

    @ParameterizedTest
    @ValueSource(strings = { "Tomato-Basil9", "Grocery$Run2026", "kale&Quinoa7", "Ünïcode#Pass1" })
    void strongPasswordsPass(String password) {
        assertThat(StrongPasswordValidator.problem(password)).isNull();
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource(delimiter = '|', value = {
            "password      | uppercase",
            "Sh0rt!        | length",
            "alllowercase1! | uppercase",
            "ALLUPPERCASE1! | lowercase",
            "NoNumbersHere! | number",
            "NoSymbols123  | symbol",
            "Password1!    | common",
            "P@ssw0rd!23   | common",
            "Victual2026!  | common",
            "Aaaaaaaa1!    | common",
    })
    void weakPasswordsSayWhy(String password, String problem) {
        assertThat(StrongPasswordValidator.problem(password)).isEqualTo(problem);
    }

    @org.junit.jupiter.api.Test
    void tooLongForBcrypt() {
        assertThat(StrongPasswordValidator.problem("Aa1!" + "x".repeat(69))).isEqualTo("length");
        assertThat(StrongPasswordValidator.problem("Aa1!" + "x".repeat(68))).isNull();
    }
}
