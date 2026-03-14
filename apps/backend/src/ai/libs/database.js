/**
 * DATABASE ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root object:
 *   - database -> ScriptDatabaseService (JdbcTemplate wrapper)
 *
 * Admin-only:
 *   - All methods throw if fully authenticated user is not admin.
 *
 * API:
 *   - database.query(dataSourceName, sql, ...params) -> Array<Map<String,Object>>
 *   - database.update(dataSourceName, sql, ...params) -> int (rows updated)
 *
 * Notes:
 *   - dataSourceName must be the Spring bean name of a DataSource
 *     (often "dataSource" in Alfresco, but depends on your setup).
 *   - Use parameter placeholders (?) and pass params to avoid SQL injection.
 *   - Be careful: UPDATE/DELETE is real and immediate.
 */

/**
 * Quick smoke test: query DB current time.
 * (SQL differs by DB vendor; use one that fits your DB.)
 */
function example_query_now() {
  var ds = 'dataSource';

  try {
    // PostgreSQL
    var rows = database.query(ds, 'select now() as db_time');
    logger.log('Rows: ' + rows.length);
    if (rows.length > 0) {
      logger.log('DB time: ' + rows[0].db_time);
    }
  } catch (e) {
    logger.log('Query failed: ' + e);
  }
}

/**
 * Count number of documents with a given aspect (by qname_id and store_id).
 *
 * Your original example:
 *   SELECT count(alf_node.id)
 *     FROM alf_node INNER JOIN alf_node_aspects ON alf_node.id = alf_node_aspects.node_id
 *     WHERE alf_node.store_id = 6
 *       AND alf_node_aspects.qname_id = 2929;
 *
 * Here it is parameterized.
 */
function example_count_docs_with_aspect_byIds() {
  var ds = 'dataSource';
  var storeId = 6;
  var aspectQNameId = 2929;

  var sql =
    'SELECT count(n.id) AS cnt ' +
    'FROM alf_node n ' +
    'INNER JOIN alf_node_aspects na ON n.id = na.node_id ' +
    'WHERE n.store_id = ? AND na.qname_id = ?';

  var rows = database.query(ds, sql, storeId, aspectQNameId);
  logger.log('Docs with aspect qname_id=' + aspectQNameId + ': ' + rows[0].cnt);
}

/**
 * Count number of documents for a custom type using namespace URI + local name.
 *
 * Based on your example for zk:mydoc.
 */
function example_count_docs_custom_type() {
  var ds = 'dataSource';

  var storeId = 6;
  var typeLocalName = 'mydoc';
  var typeNamespaceUri = 'http://www.zylk.net/model/zk/1.0';

  var sql =
    'SELECT count(*) AS cnt ' +
    'FROM alf_node n ' +
    'INNER JOIN alf_qname qn ON n.type_qname_id = qn.id AND qn.local_name = ? ' +
    'INNER JOIN alf_namespace ns ON qn.ns_id = ns.id AND ns.uri = ? ' +
    'WHERE n.store_id = ?';

  var rows = database.query(ds, sql, typeLocalName, typeNamespaceUri, storeId);
  logger.log('Docs of ' + typeNamespaceUri + ':' + typeLocalName + ': ' + rows[0].cnt);
}

/**
 * UUID -> content_url (+ basic metadata)
 *
 * This is your long query, parameterized by UUID.
 *
 * Note:
 *   - This query assumes cm:name is stored as a string_value in alf_node_properties.
 *   - It also assumes the content property is referenced through alf_node_properties.long_value -> alf_content_data.id.
 *   - In real repositories, additional joins / qname filters may be needed depending on schema/version.
 */
function example_uuid_to_content_url() {
  var ds = 'dataSource';
  var uuid = '79a03a3e-a027-4b91-9f14-02b62723591e';

  var sql =
    'SELECT ' +
    '  n.id AS node_id, ' +
    '  n.store_id AS store_id, ' +
    '  round(u.content_size/1024/1024,2) AS size_mb, ' +
    '  n.uuid AS uuid, ' +
    '  n.audit_creator AS creator, ' +
    '  n.audit_created AS created, ' +
    '  n.audit_modifier AS modifier, ' +
    '  n.audit_modified AS modified, ' +
    '  p1.string_value AS document_name, ' +
    '  u.content_url AS content_url ' +
    'FROM alf_node n, ' +
    '     alf_node_properties p, ' +
    '     alf_node_properties p1, ' +
    '     alf_namespace ns, ' +
    '     alf_qname q, ' +
    '     alf_content_data d, ' +
    '     alf_content_url u ' +
    'WHERE n.id = p.node_id ' +
    '  AND ns.id = q.ns_id ' +
    '  AND p.qname_id = q.id ' +
    '  AND p.long_value = d.id ' +
    '  AND d.content_url_id = u.id ' +
    '  AND p1.node_id = n.id ' +
    "  AND p1.qname_id IN (SELECT id FROM alf_qname WHERE local_name='name') " +
    '  AND n.uuid = ?';

  var rows = database.query(ds, sql, uuid);
  logger.log('Rows: ' + rows.length);

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    logger.log(
      'uuid=' +
        r.uuid +
        ' name=' +
        r.document_name +
        ' sizeMB=' +
        r.size_mb +
        ' contentUrl=' +
        r.content_url
    );
  }
}

/**
 * content_url -> UUID mapping (common "store://" URL).
 *
 * Your simplified approach, parameterized:
 *   select uuid, content_url, content_size ...
 *   where content_url like "store%" and n.store_id = '6'
 */
function example_content_url_to_uuid() {
  var ds = 'dataSource';

  var storeId = 6;
  var contentUrl = 'store://2017/5/10/12/34/9a0eea8e-5c50-4a9b-8ea4-f99bc08d9464.bin';

  var sql =
    'SELECT n.uuid AS uuid, cu.content_url AS content_url, cu.content_size AS content_size ' +
    'FROM alf_node_properties np ' +
    'LEFT JOIN alf_node n ON n.id = np.node_id ' +
    'LEFT JOIN alf_content_data cd ON cd.id = np.long_value ' +
    'LEFT JOIN alf_content_url cu ON cu.id = cd.content_url_id ' +
    'WHERE cu.content_url = ? AND n.store_id = ? AND cu.content_url LIKE ?';

  var rows = database.query(ds, sql, contentUrl, storeId, 'store%');

  logger.log('Matches: ' + rows.length);
  for (var i = 0; i < rows.length; i++) {
    logger.log(rows[i].uuid + ' -> ' + rows[i].content_url + ' size=' + rows[i].content_size);
  }
}

/**
 * Find content URL rows marked as orphaned.
 */
function example_list_orphan_content_urls() {
  var ds = 'dataSource';

  var sql =
    'SELECT id, content_url, orphan_time, content_size FROM alf_content_url WHERE orphan_time IS NOT NULL';

  var rows = database.query(ds, sql);
  logger.log('Orphan content_url rows: ' + rows.length);

  // Print first 20 to avoid flooding logs
  var max = Math.min(rows.length, 20);
  for (var i = 0; i < max; i++) {
    logger.log(
      rows[i].id +
        ' orphan_time=' +
        rows[i].orphan_time +
        ' size=' +
        rows[i].content_size +
        ' url=' +
        rows[i].content_url
    );
  }
}

/**
 * VERY DANGEROUS EXAMPLE:
 * Delete orphaned rows (illustrative only).
 *
 * Prefer to run destructive maintenance when repo is offline, and
 * only with vendor-specific maintenance scripts.
 *
 * This example shows how update() works, but do not copy/paste blindly.
 */
function example_update_delete_orphaned_content_urls_DO_NOT_RUN() {
  var ds = 'dataSource';

  // Example only: deletes all orphan content urls
  var sql = 'DELETE FROM alf_content_url WHERE orphan_time IS NOT NULL';

  try {
    var count = database.update(ds, sql);
    logger.log('Deleted rows: ' + count);
  } catch (e) {
    logger.log('Delete failed: ' + e);
  }
}

/**
 * Total number of documents in repository
 * Returns number of nodes which have cm:content type
 */
function example_count_total_documents() {
  var ds = 'dataSource';
  var sql =
    'select count(*) as cm_content_nodes ' +
    'from alf_node nd, alf_qname qn, alf_namespace ns ' +
    'where qn.ns_id = ns.id ' +
    '  and nd.type_qname_id = qn.id ' +
    "  and ns.uri = 'http://www.alfresco.org/model/content/1.0' " +
    "  and qn.local_name = 'content'";

  var rows = database.query(ds, sql);
  logger.log('Total cm:content nodes: ' + rows[0].cm_content_nodes);
}

/**
 * Document name - creator - date
 * Returns human readable document name, username of creator and date when this document was created
 */
function example_list_recent_documents() {
  var ds = 'dataSource';
  var minDate = '2015-05-06 14:59:00'; // Example date

  var sql =
    'select nd.audit_creator as creator, ' +
    '       np.string_value as document_name, ' +
    '       nd.audit_created as created_on ' +
    '  from alf_node nd, alf_node_properties np, ' +
    '       alf_namespace ns, alf_qname qn, alf_qname qn1 ' +
    ' where nd.id=np.node_id ' +
    '   and qn.ns_id = ns.id ' +
    '   and nd.type_qname_id = qn.id ' +
    "   and ns.uri = 'http://www.alfresco.org/model/content/1.0' " +
    "   and qn.local_name = 'content' " +
    '   and qn1.ns_id = ns.id ' +
    '   and np.qname_id = qn1.id ' +
    "   and qn1.local_name = 'name' " +
    '   and nd.audit_created > ?';

  var rows = database.query(ds, sql, minDate);

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    logger.log('Doc: ' + r.document_name + ' | Creator: ' + r.creator + ' | Date: ' + r.created_on);
  }
}

/**
 * Number of uploaded documents per person
 */
function example_count_uploads_per_person() {
  var ds = 'dataSource';
  var sql =
    'select audit_creator as uploaded_by, count(*) as doc_uploads ' +
    '  from alf_node nd, alf_qname qn, alf_namespace ns ' +
    ' where qn.ns_id = ns.id ' +
    '   and nd.type_qname_id = qn.id ' +
    "   and ns.uri = 'http://www.alfresco.org/model/content/1.0' " +
    "   and qn.local_name = 'content' " +
    ' group by audit_creator';

  var rows = database.query(ds, sql);
  for (var i = 0; i < rows.length; i++) {
    logger.log('User: ' + rows[i].uploaded_by + ' | Uploads: ' + rows[i].doc_uploads);
  }
}

/**
 * Number of users
 * Total number of nodes with type person which is basically number of users
 */
function example_count_users() {
  var ds = 'dataSource';
  var sql =
    'select count(*) as user_count ' +
    '  from alf_node nd, alf_qname qn ' +
    ' where nd.type_qname_id = qn.id ' +
    "   and qn.local_name = 'person'";

  var rows = database.query(ds, sql);
  logger.log('Total users: ' + rows[0].user_count);
}

/**
 * List of users
 * Returns list of users from the Alfresco database
 */
function example_list_users() {
  var ds = 'dataSource';
  var sql =
    'select np1.string_value as first_name, ' +
    '       np2.string_value as last_name, ' +
    '       np3.string_value as username ' +
    '  from alf_node_properties np1, ' +
    '       alf_node_properties np2, ' +
    '       alf_node_properties np3 ' +
    " where np1.qname_id in (select id from alf_qname where local_name in ('firstName')) " +
    "   and np2.qname_id in (select id from alf_qname where local_name in ('lastName')) " +
    "   and np3.qname_id in (select id from alf_qname where local_name in ('userName')) " +
    '   and np1.node_id = np2.node_id and np1.node_id = np3.node_id ' +
    ' order by 1';

  var rows = database.query(ds, sql);
  for (var i = 0; i < rows.length; i++) {
    logger.log(rows[i].username + ': ' + rows[i].first_name + ' ' + rows[i].last_name);
  }
}

/**
 * Get node’s properties using CTE (Common Table Expression)
 */
function example_get_node_properties() {
  var ds = 'dataSource';
  var nodeId = 19304; // Example node ID

  // Note: string_value concatenation or logic might differ by DB
  var sql =
    'with tt as ( ' +
    '    select ' +
    '      node_id, ' +
    '      boolean_value, ' +
    '      coalesce(string_value, ' +
    '               case ' +
    '                 when long_value != 0 then cast(long_value as TEXT) ' +
    '                 when float_value != 0 then cast(float_value as TEXT) ' +
    '                 when double_value != 0 then cast(double_value as TEXT) ' +
    '               end) as value, ' +
    '      ns.uri as namespace, ' +
    '      qn.local_name as qname ' +
    '    from ' +
    '      alf_node_properties np, ' +
    '      alf_qname qn, ' +
    '      alf_namespace ns ' +
    '    where np.qname_id =  qn.id ' +
    '      and qn.ns_id = ns.id) ' +
    'select * from tt ' +
    " where qname = 'name' " +
    "   and namespace = 'http://www.alfresco.org/model/content/1.0' " +
    '   and node_id = ?';

  var rows = database.query(ds, sql, nodeId);
  for (var i = 0; i < rows.length; i++) {
    logger.log('Prop: ' + rows[i].qname + ' = ' + rows[i].value);
  }
}

/**
 * JMX Config
 */
function example_jmx_config() {
  var ds = 'dataSource';
  var sql =
    'SELECT APSVk.string_value AS property, APSVv.string_value AS value ' +
    '  FROM alf_prop_link APL ' +
    '    JOIN alf_prop_value APVv ON APL.value_prop_id=APVv.id ' +
    '    JOIN alf_prop_value APVk ON APL.key_prop_id=APVk.id ' +
    '    JOIN alf_prop_string_value APSVk ON APVk.long_value=APSVk.id ' +
    '    JOIN alf_prop_string_value APSVv ON APVv.long_value=APSVv.id ' +
    '  WHERE APL.key_prop_id <> APL.value_prop_id ' +
    '  AND APL.root_prop_id IN (SELECT prop1_id FROM alf_prop_unique_ctx)';

  var rows = database.query(ds, sql);
  for (var i = 0; i < rows.length; i++) {
    logger.log(rows[i].property + ' = ' + rows[i].value);
  }
}
