package br.com.estudio.agentes.dao;

import br.com.estudio.agentes.model.Agent;
import br.com.estudio.agentes.model.AgentStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

@Repository
public class JdbcAgentDao implements AgentDao {

    private final JdbcTemplate jdbc;

    private static final RowMapper<Agent> MAPPER = (rs, i) -> {
        Agent a = new Agent();
        a.setId(rs.getLong("id"));
        a.setName(rs.getString("name"));
        a.setRole(rs.getString("role"));
        a.setProvider(rs.getString("provider"));
        a.setModel(rs.getString("model"));
        a.setEffort(rs.getString("effort"));
        a.setColor(rs.getString("color"));
        a.setBody(rs.getString("body"));
        a.setEyes(rs.getString("eyes"));
        a.setAntennas(rs.getBoolean("antennas"));
        a.setOrchestrator(rs.getBoolean("orchestrator"));
        String tools = rs.getString("tools");
        a.setTools(tools == null || tools.isBlank() ? List.of() : Arrays.asList(tools.split(",")));
        a.setSpec(rs.getString("spec"));
        String team = rs.getString("team_ids");
        a.setTeamIds(team == null || team.isBlank() ? List.of()
                : Arrays.stream(team.split(",")).map(Long::valueOf).toList());
        a.setDeskIndex(rs.getInt("desk_index"));
        a.setStatus(AgentStatus.valueOf(rs.getString("status")));
        a.setCompletedTasks(rs.getInt("completed_tasks"));
        a.setLastDurationMs(rs.getLong("last_duration_ms"));
        return a;
    };

    public JdbcAgentDao(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<Agent> findAll() {
        return jdbc.query("SELECT * FROM agent ORDER BY desk_index", MAPPER);
    }

    @Override
    public Optional<Agent> findById(Long id) {
        return jdbc.query("SELECT * FROM agent WHERE id = ?", MAPPER, id).stream().findFirst();
    }

    @Override
    public Agent insert(Agent a) {
        var keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO agent (name, role, provider, model, effort, color, body, eyes, antennas,
                                       tools, spec, team_ids, orchestrator, desk_index, status, completed_tasks, last_duration_ms)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
                    """, Statement.RETURN_GENERATED_KEYS);
            fill(ps, a);
            ps.setInt(14, a.getDeskIndex());
            ps.setString(15, a.getStatus().name());
            return ps;
        }, keys);
        a.setId(keys.getKey().longValue());
        return a;
    }

    @Override
    public void update(Agent a) {
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    UPDATE agent SET name = ?, role = ?, provider = ?, model = ?, effort = ?, color = ?,
                                     body = ?, eyes = ?, antennas = ?, tools = ?, spec = ?, team_ids = ?, orchestrator = ?
                    WHERE id = ?
                    """);
            fill(ps, a);
            ps.setLong(14, a.getId());
            return ps;
        });
    }

    private static void fill(PreparedStatement ps, Agent a) throws java.sql.SQLException {
        ps.setString(1, a.getName());
        ps.setString(2, a.getRole());
        ps.setString(3, a.getProvider());
        ps.setString(4, a.getModel());
        ps.setString(5, a.getEffort());
        ps.setString(6, a.getColor());
        ps.setString(7, a.getBody());
        ps.setString(8, a.getEyes());
        ps.setBoolean(9, a.isAntennas());
        ps.setString(10, String.join(",", a.getTools()));
        ps.setString(11, a.getSpec());
        ps.setString(12, a.getTeamIds().stream().map(String::valueOf).collect(java.util.stream.Collectors.joining(",")));
        ps.setBoolean(13, a.isOrchestrator());
    }

    @Override
    public void updateStatus(Long id, AgentStatus status) {
        jdbc.update("UPDATE agent SET status = ? WHERE id = ?", status.name(), id);
    }

    @Override
    public void registerCompletion(Long id, long durationMs) {
        jdbc.update("UPDATE agent SET completed_tasks = completed_tasks + 1, last_duration_ms = ? WHERE id = ?",
                durationMs, id);
    }

    @Override
    public boolean delete(Long id) {
        jdbc.update("DELETE FROM task WHERE agent_id = ?", id);
        return jdbc.update("DELETE FROM agent WHERE id = ?", id) > 0;
    }

    @Override
    public int nextDeskIndex() {
        // Reaproveita a primeira mesa livre, para não deixar buracos no escritório.
        List<Integer> used = jdbc.queryForList("SELECT desk_index FROM agent ORDER BY desk_index", Integer.class);
        int i = 0;
        while (used.contains(i)) i++;
        return i;
    }
}
