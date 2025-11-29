-- Ensure transaction changes across key tables are logged
DROP TRIGGER IF EXISTS trg_users_transaction_log ON users;
CREATE TRIGGER trg_users_transaction_log
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION log_transaction_change();

DROP TRIGGER IF EXISTS trg_sellers_transaction_log ON sellers;
CREATE TRIGGER trg_sellers_transaction_log
AFTER INSERT OR UPDATE OR DELETE ON sellers
FOR EACH ROW EXECUTE FUNCTION log_transaction_change();

DROP TRIGGER IF EXISTS trg_products_transaction_log ON products;
CREATE TRIGGER trg_products_transaction_log
AFTER INSERT OR UPDATE OR DELETE ON products
FOR EACH ROW EXECUTE FUNCTION log_transaction_change();

DROP TRIGGER IF EXISTS trg_addresses_transaction_log ON addresses;
CREATE TRIGGER trg_addresses_transaction_log
AFTER INSERT OR UPDATE OR DELETE ON addresses
FOR EACH ROW EXECUTE FUNCTION log_transaction_change();

DROP TRIGGER IF EXISTS trg_orders_transaction_log ON orders;
CREATE TRIGGER trg_orders_transaction_log
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION log_transaction_change();

DROP TRIGGER IF EXISTS trg_order_items_transaction_log ON order_items;
CREATE TRIGGER trg_order_items_transaction_log
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW EXECUTE FUNCTION log_transaction_change();

DROP TRIGGER IF EXISTS trg_chat_conversations_transaction_log ON chat_conversations;
CREATE TRIGGER trg_chat_conversations_transaction_log
AFTER INSERT OR UPDATE OR DELETE ON chat_conversations
FOR EACH ROW EXECUTE FUNCTION log_transaction_change();

DROP TRIGGER IF EXISTS trg_chat_messages_transaction_log ON chat_messages;
CREATE TRIGGER trg_chat_messages_transaction_log
AFTER INSERT OR UPDATE OR DELETE ON chat_messages
FOR EACH ROW EXECUTE FUNCTION log_transaction_change();

DROP TRIGGER IF EXISTS trg_admin_audit_logs_transaction_log ON admin_audit_logs;
CREATE TRIGGER trg_admin_audit_logs_transaction_log
AFTER INSERT OR UPDATE OR DELETE ON admin_audit_logs
FOR EACH ROW EXECUTE FUNCTION log_transaction_change();
