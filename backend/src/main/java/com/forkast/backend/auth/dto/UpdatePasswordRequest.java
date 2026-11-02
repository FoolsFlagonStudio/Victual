package com.forkast.backend.auth.dto;

import com.forkast.backend.auth.validation.StrongPassword;

import jakarta.validation.constraints.NotBlank;

public record UpdatePasswordRequest(
        @NotBlank String currentPassword,
        @NotBlank @StrongPassword String newPassword) {
}