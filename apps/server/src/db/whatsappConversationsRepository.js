const db = require('./connection');

async function saveConversation({ userId, userName, userPhone, question, response, toolCalls, error, durationMs }) {
  const result = await db.query(
    `INSERT INTO whatsapp_conversations
       (user_id, user_name, user_phone, question, response, tool_calls, error, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      userId || null,
      userName || null,
      userPhone || null,
      question,
      response || null,
      toolCalls && toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
      error || null,
      durationMs || null
    ]
  );
  return result.rows[0];
}

async function getConversations({ page = 1, limit = 50, userId, search, startDate, endDate }) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (userId) {
    conditions.push(`c.user_id = $${paramIndex++}`);
    params.push(userId);
  }

  if (search) {
    conditions.push(`(c.question ILIKE $${paramIndex} OR c.response ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (startDate) {
    conditions.push(`c.created_at >= $${paramIndex++}`);
    params.push(startDate);
  }

  if (endDate) {
    conditions.push(`c.created_at < ($${paramIndex++})::date + interval '1 day'`);
    params.push(endDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM whatsapp_conversations c ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  const offset = (page - 1) * limit;
  params.push(limit, offset);

  const result = await db.query(
    `SELECT c.id, c.user_id AS "userId", c.user_name AS "userName", c.user_phone AS "userPhone",
            c.question, c.response, c.tool_calls AS "toolCalls", c.error,
            c.duration_ms AS "durationMs", c.created_at AS "createdAt"
     FROM whatsapp_conversations c
     ${where}
     ORDER BY c.created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    params
  );

  return {
    conversations: result.rows,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
}

async function getConversationUsers() {
  const result = await db.query(
    `SELECT DISTINCT user_id AS "userId", user_name AS "userName"
     FROM whatsapp_conversations
     WHERE user_id IS NOT NULL
     ORDER BY user_name`
  );
  return result.rows;
}

module.exports = {
  saveConversation,
  getConversations,
  getConversationUsers
};
