CREATE TABLE IF NOT EXISTS transaction_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  operation text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION log_transaction_change()
RETURNS TRIGGER AS $$
DECLARE
  v_record_id uuid;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_record_id := OLD.id;
    INSERT INTO transaction_logs (table_name, record_id, operation, before_data, after_data)
    VALUES (TG_TABLE_NAME, v_record_id, TG_OP, to_jsonb(OLD), NULL);
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_record_id := NEW.id;
    INSERT INTO transaction_logs (table_name, record_id, operation, before_data, after_data)
    VALUES (TG_TABLE_NAME, v_record_id, TG_OP, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    v_record_id := NEW.id;
    INSERT INTO transaction_logs (table_name, record_id, operation, before_data, after_data)
    VALUES (TG_TABLE_NAME, v_record_id, TG_OP, NULL, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_transaction_log ON orders;
CREATE TRIGGER trg_orders_transaction_log
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION log_transaction_change();

DROP TRIGGER IF EXISTS trg_order_items_transaction_log ON order_items;
CREATE TRIGGER trg_order_items_transaction_log
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW EXECUTE FUNCTION log_transaction_change();
