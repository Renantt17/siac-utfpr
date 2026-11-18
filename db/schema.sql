-- Schemas do SIAC-UTFPR

CREATE SCHEMA IF NOT EXISTS app;

CREATE SCHEMA IF NOT EXISTS audit;

-- Define os schemas disponíveis para a aplicação
GRANT USAGE, CREATE ON SCHEMA app TO siac;
GRANT USAGE, CREATE ON SCHEMA audit TO siac;