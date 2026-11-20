-- Permite que a role siac_app gerencie apenas tabelas internas do framework Django no schema public.
GRANT USAGE, CREATE ON SCHEMA public TO siac_app;
ALTER DEFAULT PRIVILEGES FOR ROLE siac_app IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO siac_app;
ALTER DEFAULT PRIVILEGES FOR ROLE siac_app IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO siac_app;

-- Função controlada para exclusão física de grupo sem submissões (Aba 07) preservando menor privilégio em siac_app.
CREATE OR REPLACE FUNCTION app.fn_delete_unused_activity_group(p_group_id BIGINT)
RETURNS TEXT
SECURITY DEFINER
SET search_path = app, public, pg_temp
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM app.submissions s
          JOIN app.activity_items i ON i.id = s.activity_item_id
         WHERE i.group_id = p_group_id
    ) THEN
        UPDATE app.activity_groups SET is_active = FALSE WHERE id = p_group_id;
        RETURN 'DEACTIVATED';
    END IF;

    DELETE FROM app.activity_items WHERE group_id = p_group_id AND parent_item_id IS NOT NULL;
    DELETE FROM app.activity_items WHERE group_id = p_group_id;
    DELETE FROM app.activity_groups WHERE id = p_group_id;
    RETURN 'DELETED';
END;
$$;

ALTER FUNCTION app.fn_delete_unused_activity_group(BIGINT) OWNER TO siac_owner;
REVOKE ALL ON FUNCTION app.fn_delete_unused_activity_group(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_delete_unused_activity_group(BIGINT) TO siac_app;
