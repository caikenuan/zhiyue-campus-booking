export async function writeLog(
  executor,
  { actorId = null, action, targetType, targetId = null, resourceId = null, detail = null },
) {
  await executor.query(
    `INSERT INTO operation_logs (actor_id, action, target_type, target_id, resource_id, detail)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [actorId, action, targetType, targetId, resourceId, detail ? JSON.stringify(detail) : null],
  );
}
