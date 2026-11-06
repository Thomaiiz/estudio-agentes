package br.com.estudio.agentes.dto;

public record ProviderStats(
        String provider,
        int agents,
        int tasks,
        int completed,
        int failed,
        long totalDurationMs
) {}
