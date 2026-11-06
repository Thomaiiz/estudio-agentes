package br.com.estudio.agentes.dto;

import java.util.List;

public record StatsResponse(
        int totalTasks,
        int completedTasks,
        int runningTasks,
        long totalDurationMs,
        List<ProviderStats> providers
) {}
