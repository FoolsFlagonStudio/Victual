package com.forkast.backend.auth.dto;

import jakarta.validation.constraints.Email;
import com.forkast.backend.auth.validation.StrongPassword;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record ResetPasswordRequest(
        @NotBlank @Email String email,
        @NotBlank @Pattern(regexp = "\\d{6}", message = "must be a 6-digit code") String code,
        @NotBlank @StrongPassword String newPassword) {
}