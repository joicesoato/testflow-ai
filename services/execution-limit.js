function createFreeExecutionLimit(pool, { limit = 3, lockTimeoutSeconds = 10 } = {}) {
  return async function enforceFreeExecutionLimit(req, res, next) {
    const userId = Number(req.usuario?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({ erro: "Faça login para executar testes." });
    }

    const lockName = `testflow:free-exec:${userId}`;
    let connection;
    let acquired = false;
    let released = false;
    const release = async () => {
      if (released || !connection) return;
      released = true;
      try {
        if (acquired) await connection.execute("SELECT RELEASE_LOCK(?)", [lockName]);
      } catch (error) {
        console.error("Falha ao liberar lock de execução Free:", error.message);
      } finally {
        connection.release();
      }
    };

    try {
      connection = await pool.getConnection();
      const [lockRows] = await connection.execute("SELECT GET_LOCK(?, ?) AS adquirido", [lockName, lockTimeoutSeconds]);
      acquired = Number(lockRows[0]?.adquirido) === 1;
      if (!acquired) {
        await release();
        return res.status(503).json({ erro: "Não foi possível verificar seu limite de execuções. Tente novamente." });
      }

      const [subscriptions] = await connection.execute(
        "SELECT plano, status FROM assinaturas WHERE usuario_id = ? LIMIT 1",
        [userId]
      );
      const subscription = subscriptions[0];
      const isPro = subscription?.plano === "pro" && ["active", "trialing"].includes(subscription.status);
      if (isPro) {
        await release();
        return next();
      }

      const [counts] = await connection.execute(
        `SELECT COUNT(*) AS total FROM execucoes
         WHERE usuario_id = ?
           AND executado_em >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
           AND executado_em < DATE_ADD(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 1 MONTH)`,
        [userId]
      );
      if (Number(counts[0]?.total || 0) >= limit) {
        await release();
        return res.status(403).json({
          erro: `O plano Free permite ${limit} execuções por mês. Assine o Pro para continuar executando testes.`
        });
      }

      req.liberarLockExecucaoFree = release;
      res.once("finish", release);
      next();
    } catch (error) {
      await release();
      console.error("Falha ao verificar limite de execuções Free:", error.message);
      if (!res.headersSent) {
        return res.status(503).json({ erro: "Não foi possível verificar o plano e o limite de execuções." });
      }
      next(error);
    }
  };
}

module.exports = { createFreeExecutionLimit };