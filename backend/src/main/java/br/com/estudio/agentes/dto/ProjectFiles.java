package br.com.estudio.agentes.dto;

import java.time.Instant;
import java.util.List;

/** Arquivos da pasta de uma entrega. {@code changed} = mexido durante esta tarefa. */
public record ProjectFiles(
        Long taskId,
        Long agentId,
        String title,
        String status,
        String workspace,
        Instant startedAt,
        Instant finishedAt,
        String result,
        List<FileEntry> files
) {
    public record FileEntry(String path, long size, Instant modifiedAt, boolean changed) {}
}
