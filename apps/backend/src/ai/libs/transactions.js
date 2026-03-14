/**
 * Transaction root object examples (OOTBee Support Tools)
 *
 * Root object:
 *   - transactions -> ScriptTransactions
 *
 * API:
 *   - transactions.getUserTransaction() -> ScriptTransaction
 *   - transactions.isReadOnly() -> boolean
 *
 * ScriptTransaction API:
 *   - begin()
 *   - commit()
 *   - rollback()
 *   - getStatus() -> int (javax.transactions.Status)
 *
 * Notes:
 *   - Most Alfresco server-side JS runs inside an existing transactions.
 *   - Starting nested transactions may throw NotSupportedException.
 *   - Use carefully and only when you control the execution context.
 */

/**
 * Check if the current execution context is read-only.
 */
function example_transaction_isReadOnly() {
  if (transactions.isReadOnly()) {
    logger.warn('Transaction context is read-only (writes may fail)');
  } else {
    logger.log('Transaction context allows writes');
  }
}

/**
 * Begin/commit a user transaction explicitly.
 * This only works if you're not already in a transaction or Alfresco allows nesting.
 */
function example_transaction_explicitCommit() {
  var tx = transactions.getUserTransaction();

  try {
    tx.begin();
    logger.log('TX started, status=' + tx.getStatus());

    // Do something that writes:
    // node.properties["cm:description"] = "updated";
    // node.save();

    tx.commit();
    logger.log('TX committed successfully');
  } catch (e) {
    logger.error('TX failed: ' + e);

    try {
      tx.rollback();
      logger.log('TX rolled back');
    } catch (rollbackErr) {
      logger.error('TX rollback also failed: ' + rollbackErr);
    }

    throw e;
  }
}

/**
 * Safely rollback on purpose (example diagnostic pattern).
 * Useful to test or validate logic without persisting changes.
 */
function example_transaction_dryRunRollback(node) {
  var tx = transactions.getUserTransaction();

  try {
    tx.begin();

    node.properties['cm:description'] = 'TEMP change - should not persist';
    node.save();

    logger.log('Updated node inside TX. Rolling back intentionally...');
    tx.rollback();

    logger.log('Rollback done, node changes should not be persisted');
  } catch (e) {
    logger.error('Dry-run rollback failed: ' + e);
    throw e;
  }
}

/**
 * Translate transaction status codes into readable text.
 * javax.transactions.Status constants:
 *   0=STATUS_ACTIVE
 *   1=STATUS_MARKED_ROLLBACK
 *   2=STATUS_PREPARED
 *   3=STATUS_COMMITTED
 *   4=STATUS_ROLLEDBACK
 *   5=STATUS_UNKNOWN
 *   6=STATUS_NO_TRANSACTION
 *   7=STATUS_PREPARING
 *   8=STATUS_COMMITTING
 *   9=STATUS_ROLLING_BACK
 */
function example_transaction_statusName() {
  var tx = transactions.getUserTransaction();

  function statusToString(s) {
    switch (s) {
      case 0:
        return 'ACTIVE';
      case 1:
        return 'MARKED_ROLLBACK';
      case 2:
        return 'PREPARED';
      case 3:
        return 'COMMITTED';
      case 4:
        return 'ROLLEDBACK';
      case 5:
        return 'UNKNOWN';
      case 6:
        return 'NO_TRANSACTION';
      case 7:
        return 'PREPARING';
      case 8:
        return 'COMMITTING';
      case 9:
        return 'ROLLING_BACK';
      default:
        return 'UNDEFINED(' + s + ')';
    }
  }

  try {
    tx.begin();
    var status = tx.getStatus();
    logger.log('TX status=' + status + ' (' + statusToString(status) + ')');
    tx.rollback();
  } catch (e) {
    logger.error('Status example failed: ' + e);
  }
}
