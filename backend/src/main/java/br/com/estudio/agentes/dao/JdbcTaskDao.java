package br.com.estudio.agentes.dao;

import br.com.estudio.agentes.model.Task;
import br.com.estudio.agentes.model.TaskStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class JdbcTaskDao implements TaskDao {

    private final JdbcTemplate jdbc;

    private static final RowMapper<Task> MAPPER = (rs, i) -> {
        Task t = new Task();
        t.setId(rs.getLong("id"));
        t.setAgentId(rs.getLong("agent_id"));
        long parent = rs.getLong("parent_id");
        t.setParentId(rs.wasNull() ? null : parent);
        t.setWorkspace(rs.getString("workspace"));
        t.setTitle(rs.getString("title"));
        t.setDescription(rs.getString("description"));
        t.setStatus(TaskStatus.valueOf(rs.getString("status")));
        t.setProgress(rs.getInt("progress"));
        t.setResult(rs.getString("result"));
        t.setCreatedAt(toInstant(rs.getTimestamp("created_at")));
        t.setStartedAt(toInstant(rs.getTimestamp("started_at")));
        t.setFinishedAt(toInstant(rs.getTimestamp("finished_at")));
        return t;
    };

    public JdbcTaskDao(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static Instant toInstant(Timestamp ts) {
        return ts == null ? null : ts.toInstant();
    }

    private static Timestamp toTs(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }

    @Override
    public Task insert(Task t) {
        var keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO task (agent_id, title, description, status, progress, created_at, parent_id, workspace)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, t.getAgentId());
            ps.setString(2, t.getTitle());
            ps.setString(3, t.getDescription());
            ps.setString(4, t.getStatus().name());
            ps.setInt(5, t.getProgress());
            ps.setTimestamp(6, toTs(t.getCreatedAt()));
            ps.setObject(7, t.getParentId());
            ps.setString(8, t.getWorkspace());
            return ps;
        }, keys);
        t.setId(keys.getKey().longValue());
        return t;
    }

    @Override
    public void update(Task t) {
        jdbc.update("""
                UPDATE task SET status = ?, progress = ?, result = ?, started_at = ?, finished_at = ?, workspace = ?
                WHERE id = ?
                """, t.getStatus().name(), t.getProgress(), t.getResult(),
                toTs(t.getStartedAt()), toTs(t.getFinishedAt()), t.getWorkspace(), t.getId());
    }

    @Override
    public Optional<Task> findById(Long id) {
        return jdbc.query("SELECT * FROM task WHERE id = ?", MAPPER, id).stream().findFirst();
    }

    @Override
    public List<Task> findRecent(int limit) {
        return jdbc.query("SELECT * FROM task ORDER BY id DESC LIMIT ?", MAPPER, limit);
    }

    @Override
    public List<Task> findByAgent(Long agentId, int limit) {
        return jdbc.query("SELECT * FROM task WHERE agent_id = ? ORDER BY id DESC LIMIT ?", MAPPER, agentId, limit);
    }

    @Override
    public List<Task> findChildren(Long parentId) {
        return jdbc.query("SELECT * FROM task WHERE parent_id = ? ORDER BY id", MAPPER, parentId);
    }
}
