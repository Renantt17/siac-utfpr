-- Habilita a extensão btree_gist para suportar restrições de exclusão temporal com tipos escalares e intervalos de datas.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Cria as roles de banco para separar a propriedade dos objetos (siac_owner) da execução da aplicação (siac_app).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'siac_owner') THEN
        CREATE ROLE siac_owner NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'siac_app') THEN
        CREATE ROLE siac_app NOLOGIN;
    END IF;
END
$$;

-- Cria o schema transacional principal da aplicação sob propriedade de siac_owner.
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION siac_owner;

-- Cria o schema isolado para armazenamento imutável da trilha de auditoria sob propriedade de siac_owner.
CREATE SCHEMA IF NOT EXISTS audit AUTHORIZATION siac_owner;

-- Define a sessão atual como siac_owner para que todas as tabelas, sequências e funções pertençam a essa role.
SET ROLE siac_owner;

-- Armazena os campi da UTFPR aos quais usuários, cursos e oportunidades estão vinculados.
CREATE TABLE app.campuses (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    name VARCHAR(120) NOT NULL,
    acronym VARCHAR(10) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_campuses PRIMARY KEY (id),
    CONSTRAINT uq_campuses_acronym UNIQUE (acronym)
);

-- Armazena os usuários pré-cadastrados (estudantes, docentes, coordenadores de curso e coordenador do SIAC).
CREATE TABLE app.users (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid(),
    institutional_id VARCHAR(30) NOT NULL,
    email VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    primary_role VARCHAR(20) NOT NULL,
    campus_id BIGINT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uq_users_public_id UNIQUE (public_id),
    CONSTRAINT uq_users_institutional_id UNIQUE (institutional_id),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT chk_users_primary_role CHECK (
        primary_role IN ('STUDENT', 'PROFESSOR', 'COURSE_COORD', 'SIAC_COORD')
    ),
    CONSTRAINT fk_users_campus FOREIGN KEY (campus_id)
        REFERENCES app.campuses (id) ON DELETE RESTRICT
);

-- Associa múltiplos papéis aos usuários e serve de alvo para chaves estrangeiras compostas declarativas por perfil.
CREATE TABLE app.user_roles (
    user_id BIGINT NOT NULL,
    role VARCHAR(20) NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_user_roles PRIMARY KEY (user_id, role),
    CONSTRAINT chk_user_roles_role CHECK (
        role IN ('STUDENT', 'PROFESSOR', 'COURSE_COORD', 'SIAC_COORD')
    ),
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id)
        REFERENCES app.users (id) ON DELETE RESTRICT
);

-- Armazena os cursos de graduação, suas metas mínimas de pontuação total e os vínculos de coordenação e docente PRAC.
CREATE TABLE app.courses (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    campus_id BIGINT NOT NULL,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(20) NOT NULL,
    coordinator_id BIGINT NOT NULL,
    coordinator_role VARCHAR(20) GENERATED ALWAYS AS ('COURSE_COORD') STORED,
    prac_professor_id BIGINT NOT NULL,
    prac_role VARCHAR(20) GENERATED ALWAYS AS ('PROFESSOR') STORED,
    min_total_points NUMERIC(5,2) NOT NULL DEFAULT 70.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_courses PRIMARY KEY (id),
    CONSTRAINT uq_courses_campus_code UNIQUE (campus_id, code),
    CONSTRAINT chk_courses_min_total CHECK (min_total_points > 0),
    CONSTRAINT fk_courses_campus FOREIGN KEY (campus_id)
        REFERENCES app.campuses (id) ON DELETE RESTRICT,
    CONSTRAINT fk_courses_coordinator FOREIGN KEY (coordinator_id, coordinator_role)
        REFERENCES app.user_roles (user_id, role) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_courses_prac FOREIGN KEY (prac_professor_id, prac_role)
        REFERENCES app.user_roles (user_id, role) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Registra as matrículas dos estudantes nos cursos com data de ingresso e situação do vínculo acadêmico.
CREATE TABLE app.enrollments (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    student_id BIGINT NOT NULL,
    student_role VARCHAR(20) GENERATED ALWAYS AS ('STUDENT') STORED,
    course_id BIGINT NOT NULL,
    enrollment_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_enrollments PRIMARY KEY (id),
    CONSTRAINT chk_enrollments_status CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELED')),
    CONSTRAINT fk_enrollments_student FOREIGN KEY (student_id, student_role)
        REFERENCES app.user_roles (user_id, role) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_enrollments_course FOREIGN KEY (course_id)
        REFERENCES app.courses (id) ON DELETE RESTRICT
);

-- Garante que um estudante possua no máximo uma matrícula ativa por curso, permitindo histórico de reingressos.
CREATE UNIQUE INDEX uq_enrollments_active_student_course
    ON app.enrollments (student_id, course_id)
    WHERE status = 'ACTIVE';

-- Registra períodos de trancamento de matrícula, impedindo sobreposição de datas para o mesmo vínculo.
CREATE TABLE app.enrollment_suspensions (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    enrollment_id BIGINT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_enrollment_suspensions PRIMARY KEY (id),
    CONSTRAINT chk_suspensions_dates CHECK (end_date >= start_date),
    CONSTRAINT fk_suspensions_enrollment FOREIGN KEY (enrollment_id)
        REFERENCES app.enrollments (id) ON DELETE RESTRICT,
    CONSTRAINT ex_suspensions_no_overlap EXCLUDE USING gist (
        enrollment_id WITH =,
        daterange(start_date, end_date, '[]') WITH &&
    )
);

-- Armazena os grupos de atividades complementares de cada curso (ex.: Grupos 1, 2 e 3) e sua pontuação mínima exigida.
CREATE TABLE app.activity_groups (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    course_id BIGINT NOT NULL,
    group_number SMALLINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    min_points NUMERIC(5,2) NOT NULL DEFAULT 20.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT pk_activity_groups PRIMARY KEY (id),
    CONSTRAINT uq_groups_course_number UNIQUE (course_id, group_number),
    CONSTRAINT uq_groups_id_course UNIQUE (id, course_id),
    CONSTRAINT chk_groups_number CHECK (group_number >= 1),
    CONSTRAINT chk_groups_min_points CHECK (min_points >= 0),
    CONSTRAINT fk_groups_course FOREIGN KEY (course_id)
        REFERENCES app.courses (id) ON DELETE RESTRICT
);

-- Armazena os itens e subitens da Tabela de Pontuação com garantia declarativa de hierarquia de no máximo um nível.
CREATE TABLE app.activity_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    group_id BIGINT NOT NULL,
    parent_item_id BIGINT NULL,
    parent_required_selectable BOOLEAN GENERATED ALWAYS AS (
        CASE WHEN parent_item_id IS NOT NULL THEN FALSE ELSE NULL END
    ) STORED,
    code VARCHAR(15) NOT NULL,
    description TEXT NOT NULL,
    points_per_unit NUMERIC(5,2) NULL,
    unit_name VARCHAR(40) NULL,
    max_points_semester NUMERIC(5,2) NULL,
    required_proof_description VARCHAR(255) NULL,
    is_selectable BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_activity_items PRIMARY KEY (id),
    CONSTRAINT uq_items_group_code UNIQUE (group_id, code),
    CONSTRAINT uq_items_id_group_selectable UNIQUE (id, group_id, is_selectable),
    CONSTRAINT uq_items_id_selectable UNIQUE (id, is_selectable),
    CONSTRAINT chk_items_hierarchy_depth CHECK (
        (is_selectable = FALSE AND parent_item_id IS NULL AND points_per_unit IS NULL AND max_points_semester IS NOT NULL)
        OR
        (is_selectable = TRUE AND points_per_unit IS NOT NULL AND points_per_unit > 0 AND unit_name IS NOT NULL AND required_proof_description IS NOT NULL)
    ),
    CONSTRAINT chk_items_max_sem CHECK (max_points_semester IS NULL OR max_points_semester > 0),
    CONSTRAINT fk_items_group FOREIGN KEY (group_id)
        REFERENCES app.activity_groups (id) ON DELETE RESTRICT,
    CONSTRAINT fk_items_parent_same_group FOREIGN KEY (parent_item_id, group_id, parent_required_selectable)
        REFERENCES app.activity_items (id, group_id, is_selectable) ON DELETE RESTRICT
);

-- Armazena as submissões de certificados, snapshots de regras, valores originais do aluno e decisões do docente.
CREATE TABLE app.submissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid(),
    enrollment_id BIGINT NOT NULL,
    activity_item_id BIGINT NOT NULL,
    item_must_be_selectable BOOLEAN GENERATED ALWAYS AS (TRUE) STORED,
    description VARCHAR(255) NOT NULL,
    activity_start_date DATE NOT NULL,
    activity_end_date DATE NOT NULL,
    semester CHAR(6) NOT NULL,
    declared_quantity NUMERIC(6,2) NOT NULL,
    validated_quantity NUMERIC(6,2) NULL,
    original_activity_item_id BIGINT NOT NULL,
    original_semester CHAR(6) NOT NULL,
    original_declared_quantity NUMERIC(6,2) NOT NULL,
    applied_points_per_unit NUMERIC(5,2) NOT NULL,
    applied_unit_name VARCHAR(40) NOT NULL,
    applied_max_points_semester NUMERIC(5,2) NULL,
    calculated_points NUMERIC(6,2) GENERATED ALWAYS AS (
        ROUND(declared_quantity * applied_points_per_unit, 2)
    ) STORED,
    approved_points NUMERIC(6,2) NULL,
    file_path VARCHAR(500) NOT NULL,
    file_ext VARCHAR(5) NOT NULL,
    mime_type VARCHAR(50) NOT NULL,
    file_size_bytes INT NOT NULL,
    file_hash_sha256 CHAR(64) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    evaluator_id BIGINT NULL,
    evaluator_role VARCHAR(20) GENERATED ALWAYS AS (
        CASE WHEN evaluator_id IS NOT NULL THEN 'PROFESSOR' ELSE NULL END
    ) STORED,
    evaluator_feedback TEXT NULL,
    was_adjusted BOOLEAN NOT NULL DEFAULT FALSE,
    row_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    evaluated_at TIMESTAMPTZ NULL,
    CONSTRAINT pk_submissions PRIMARY KEY (id),
    CONSTRAINT uq_submissions_public_id UNIQUE (public_id),
    CONSTRAINT chk_submissions_dates CHECK (activity_end_date >= activity_start_date),
    CONSTRAINT chk_submissions_semester_fmt CHECK (
        semester ~ '^[0-9]{4}\.[12]$' AND original_semester ~ '^[0-9]{4}\.[12]$'
    ),
    CONSTRAINT chk_submissions_qty CHECK (
        declared_quantity > 0 AND original_declared_quantity > 0
        AND (validated_quantity IS NULL OR validated_quantity > 0)
    ),
    CONSTRAINT chk_submissions_status CHECK (status IN (
        'PENDING', 'CORRECTION_REQUESTED', 'APPROVED', 'APPROVED_WITH_ADJUSTMENTS', 'REJECTED', 'CANCELED'
    )),
    CONSTRAINT chk_submissions_approval_integrity CHECK (
        (
            status = 'APPROVED'
            AND was_adjusted = FALSE
            AND validated_quantity = declared_quantity
            AND activity_item_id = original_activity_item_id
            AND semester = original_semester
            AND approved_points IS NOT NULL
            AND approved_points > 0
            AND approved_points <= ROUND(declared_quantity * applied_points_per_unit, 2)
            AND evaluator_id IS NOT NULL
            AND evaluated_at IS NOT NULL
        )
        OR
        (
            status = 'APPROVED_WITH_ADJUSTMENTS'
            AND was_adjusted = TRUE
            AND validated_quantity IS NOT NULL
            AND approved_points IS NOT NULL
            AND approved_points > 0
            AND approved_points <= ROUND(validated_quantity * applied_points_per_unit, 2)
            AND evaluator_id IS NOT NULL
            AND evaluated_at IS NOT NULL
        )
        OR
        (
            status IN ('CORRECTION_REQUESTED', 'REJECTED')
            AND was_adjusted = FALSE
            AND approved_points IS NULL
            AND validated_quantity IS NULL
            AND evaluator_id IS NOT NULL
            AND evaluated_at IS NOT NULL
        )
        OR
        (
            status IN ('PENDING', 'CANCELED')
            AND was_adjusted = FALSE
            AND approved_points IS NULL
            AND validated_quantity IS NULL
        )
    ),
    CONSTRAINT chk_submissions_feedback_required CHECK (
        (
            status NOT IN ('CORRECTION_REQUESTED', 'REJECTED', 'APPROVED_WITH_ADJUSTMENTS')
            AND NOT (status = 'APPROVED' AND approved_points < ROUND(declared_quantity * applied_points_per_unit, 2))
        )
        OR (evaluator_feedback IS NOT NULL AND length(trim(evaluator_feedback)) > 0)
    ),
    CONSTRAINT chk_submissions_file_type CHECK (
        (file_ext = 'pdf' AND mime_type = 'application/pdf') OR
        (file_ext = 'jpg' AND mime_type = 'image/jpeg') OR
        (file_ext = 'png' AND mime_type = 'image/png')
    ),
    CONSTRAINT chk_submissions_file_size CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
    CONSTRAINT fk_submissions_enrollment FOREIGN KEY (enrollment_id)
        REFERENCES app.enrollments (id) ON DELETE RESTRICT,
    CONSTRAINT fk_submissions_selectable_item FOREIGN KEY (activity_item_id, item_must_be_selectable)
        REFERENCES app.activity_items (id, is_selectable) ON DELETE RESTRICT,
    CONSTRAINT fk_submissions_original_item FOREIGN KEY (original_activity_item_id, item_must_be_selectable)
        REFERENCES app.activity_items (id, is_selectable) ON DELETE RESTRICT,
    CONSTRAINT fk_submissions_evaluator FOREIGN KEY (evaluator_id, evaluator_role)
        REFERENCES app.user_roles (user_id, role) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Impede o envio duplicado de um mesmo certificado ativo na matrícula, liberando reenvio se cancelado ou indeferido.
CREATE UNIQUE INDEX uq_submissions_active_file_hash
    ON app.submissions (enrollment_id, file_hash_sha256)
    WHERE status NOT IN ('CANCELED', 'REJECTED');

-- Registra a homologação final de conclusão das Atividades Complementares e o status de sincronização com o Portal UTFPR.
CREATE TABLE app.homologations (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid(),
    enrollment_id BIGINT NOT NULL,
    total_approved_points NUMERIC(6,2) NOT NULL,
    required_min_total_points NUMERIC(6,2) NOT NULL,
    report_pdf_path VARCHAR(500) NOT NULL,
    report_pdf_hash_sha256 CHAR(64) NOT NULL,
    student_confirmed_at TIMESTAMPTZ NULL,
    homologated_by_id BIGINT NOT NULL,
    homologated_by_role VARCHAR(20) GENERATED ALWAYS AS ('PROFESSOR') STORED,
    homologated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    portal_sync_status VARCHAR(20) NOT NULL DEFAULT 'PENDING_SYNC',
    portal_synced_at TIMESTAMPTZ NULL,
    portal_error_log TEXT NULL,
    CONSTRAINT pk_homologations PRIMARY KEY (id),
    CONSTRAINT uq_homologations_public_id UNIQUE (public_id),
    CONSTRAINT uq_homologations_enrollment UNIQUE (enrollment_id),
    CONSTRAINT chk_homologations_total_met CHECK (
        required_min_total_points > 0 AND total_approved_points >= required_min_total_points
    ),
    CONSTRAINT chk_homologations_sync CHECK (
        portal_sync_status IN ('PENDING_SYNC', 'SYNCED', 'SYNC_FAILED')
    ),
    CONSTRAINT fk_homologations_enrollment FOREIGN KEY (enrollment_id)
        REFERENCES app.enrollments (id) ON DELETE RESTRICT,
    CONSTRAINT fk_homologations_professor FOREIGN KEY (homologated_by_id, homologated_by_role)
        REFERENCES app.user_roles (user_id, role) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Armazena a pontuação consolidada e o mínimo exigido em cada grupo de atividades no momento da homologação.
CREATE TABLE app.homologation_group_scores (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    homologation_id BIGINT NOT NULL,
    group_id BIGINT NOT NULL,
    approved_points NUMERIC(5,2) NOT NULL,
    required_min_points NUMERIC(5,2) NOT NULL,
    CONSTRAINT pk_homologation_group_scores PRIMARY KEY (id),
    CONSTRAINT uq_homologation_group UNIQUE (homologation_id, group_id),
    CONSTRAINT chk_homologation_group_met CHECK (
        required_min_points >= 0 AND approved_points >= required_min_points
    ),
    CONSTRAINT fk_hgs_homologation FOREIGN KEY (homologation_id)
        REFERENCES app.homologations (id) ON DELETE RESTRICT,
    CONSTRAINT fk_hgs_group FOREIGN KEY (group_id)
        REFERENCES app.activity_groups (id) ON DELETE RESTRICT
);

-- Armazena os eventos, cursos e palestras divulgados pelo Coordenador do SIAC no mural de oportunidades.
CREATE TABLE app.opportunities (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    campus_id BIGINT NULL,
    suggested_group_number SMALLINT NULL,
    suggested_item_code VARCHAR(15) NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    estimated_hours NUMERIC(5,2) NULL,
    modality VARCHAR(15) NOT NULL,
    is_external BOOLEAN NOT NULL DEFAULT FALSE,
    organizer_name VARCHAR(200) NOT NULL,
    certification_rules TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_id BIGINT NOT NULL,
    created_by_role VARCHAR(20) GENERATED ALWAYS AS ('SIAC_COORD') STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_opportunities PRIMARY KEY (id),
    CONSTRAINT uq_opportunities_public_id UNIQUE (public_id),
    CONSTRAINT chk_opportunities_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_opportunities_hours CHECK (estimated_hours IS NULL OR estimated_hours > 0),
    CONSTRAINT chk_opportunities_suggestion CHECK (
        (suggested_group_number IS NULL AND suggested_item_code IS NULL)
        OR (suggested_group_number >= 1 AND suggested_item_code IS NOT NULL)
    ),
    CONSTRAINT chk_opportunities_modality CHECK (modality IN ('PRESENCIAL', 'REMOTO', 'HIBRIDO')),
    CONSTRAINT fk_opportunities_campus FOREIGN KEY (campus_id)
        REFERENCES app.campuses (id) ON DELETE RESTRICT,
    CONSTRAINT fk_opportunities_creator FOREIGN KEY (created_by_id, created_by_role)
        REFERENCES app.user_roles (user_id, role) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Armazena as notificações enviadas aos usuários sobre resultados de avaliações, ajustes, correções e homologações.
CREATE TABLE app.notifications (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid(),
    recipient_id BIGINT NOT NULL,
    submission_id BIGINT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_notifications PRIMARY KEY (id),
    CONSTRAINT uq_notifications_public_id UNIQUE (public_id),
    CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id)
        REFERENCES app.users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_notifications_submission FOREIGN KEY (submission_id)
        REFERENCES app.submissions (id) ON DELETE RESTRICT
);

-- Armazena os registros imutáveis de auditoria com snapshots JSONB (antes e depois) de todas as ações críticas.
CREATE TABLE audit.audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    entity_type VARCHAR(40) NOT NULL,
    entity_id BIGINT NOT NULL,
    action VARCHAR(40) NOT NULL,
    actor_id BIGINT NULL,
    ip_address INET NULL,
    previous_status VARCHAR(30) NULL,
    new_status VARCHAR(30) NULL,
    before_snapshot JSONB NULL,
    after_snapshot JSONB NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_audit_logs PRIMARY KEY (id),
    CONSTRAINT chk_audit_entity_type CHECK (entity_type IN (
        'SUBMISSION', 'HOMOLOGATION', 'USER_ROLE', 'SCORING_ITEM', 'ENROLLMENT', 'COURSE'
    )),
    CONSTRAINT chk_audit_action CHECK (action IN (
        'CREATED', 'UPDATED', 'CANCELED', 'COMPLETED', 'APPROVED', 'APPROVED_WITH_ADJUSTMENTS',
        'CORRECTION_REQUESTED', 'REJECTED', 'OPINION_REVISED', 'HOMOLOGATED',
        'PORTAL_SYNC_UPDATED', 'ROLE_GRANTED', 'ROLE_REVOKED'
    )),
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id)
        REFERENCES app.users (id) ON DELETE RESTRICT
);

-- Função de trigger que bloqueia qualquer tentativa de UPDATE, DELETE ou TRUNCATE sobre os registros de auditoria.
CREATE OR REPLACE FUNCTION audit.fn_prevent_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Operação % proibida: registros em audit.audit_logs são estritamente imutáveis.', TG_OP;
END;
$$;

-- Trigger que impede atualização ou remoção de linhas individuais na tabela de auditoria.
CREATE TRIGGER trg_audit_immutable_row
BEFORE UPDATE OR DELETE ON audit.audit_logs
FOR EACH ROW EXECUTE FUNCTION audit.fn_prevent_audit_mutation();

-- Trigger que impede o esvaziamento da tabela de auditoria via comando TRUNCATE.
CREATE TRIGGER trg_audit_immutable_truncate
BEFORE TRUNCATE ON audit.audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION audit.fn_prevent_audit_mutation();

-- Função utilitária para atualizar automaticamente o carimbo de tempo updated_at em alterações de linha.
CREATE OR REPLACE FUNCTION app.fn_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

-- Atualiza automaticamente a coluna updated_at sempre que um registro de usuário for modificado.
CREATE TRIGGER trg_users_touch_updated_at
BEFORE UPDATE ON app.users
FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

-- Atualiza automaticamente a coluna updated_at sempre que um registro de curso for modificado.
CREATE TRIGGER trg_courses_touch_updated_at
BEFORE UPDATE ON app.courses
FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

-- Atualiza automaticamente a coluna updated_at sempre que um registro de matrícula for modificado.
CREATE TRIGGER trg_enrollments_touch_updated_at
BEFORE UPDATE ON app.enrollments
FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

-- Função que protege as transições de estado da matrícula e impede alterar dados base após existirem submissões.
CREATE OR REPLACE FUNCTION app.fn_validate_enrollment_integrity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'ACTIVE' THEN
            RAISE EXCEPTION 'Novas matrículas devem iniciar obrigatoriamente com status ACTIVE.';
        END IF;
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('enrollment:' || OLD.id::text, 0)
    );

    IF OLD.status IN ('COMPLETED', 'CANCELED') AND NEW.status <> OLD.status THEN
        RAISE EXCEPTION 'Transição inválida em matrícula (% -> %): matrículas concluídas ou canceladas não podem ser reabertas.',
            OLD.status, NEW.status;
    END IF;

    IF (NEW.student_id <> OLD.student_id OR NEW.course_id <> OLD.course_id OR NEW.enrollment_date <> OLD.enrollment_date)
       AND EXISTS (SELECT 1 FROM app.submissions s WHERE s.enrollment_id = OLD.id) THEN
        RAISE EXCEPTION 'Não é permitido alterar student_id, course_id ou enrollment_date de uma matrícula que já possui submissões.';
    END IF;

    IF NEW.status = 'COMPLETED' AND NOT EXISTS (
        SELECT 1 FROM app.homologations h WHERE h.enrollment_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'A matrícula % não pode ser marcada como COMPLETED sem um registro de homologação válido em app.homologations.',
            NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

-- Aplica a validação de integridade e transições de status antes de inserir ou atualizar matrículas.
CREATE TRIGGER trg_enrollments_validate_integrity
BEFORE INSERT OR UPDATE ON app.enrollments
FOR EACH ROW EXECUTE FUNCTION app.fn_validate_enrollment_integrity();

-- Função que impede mover grupos entre cursos ou alterar o grupo, item-pai e natureza selecionável de itens criados.
CREATE OR REPLACE FUNCTION app.fn_prevent_scoring_structure_move()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME = 'activity_groups' THEN
        IF NEW.course_id <> OLD.course_id THEN
            RAISE EXCEPTION 'Não é permitido transferir um grupo de atividades (%) para outro curso.', OLD.id;
        END IF;
    ELSIF TG_TABLE_NAME = 'activity_items' THEN
        IF NEW.group_id <> OLD.group_id
           OR NEW.parent_item_id IS DISTINCT FROM OLD.parent_item_id
           OR NEW.is_selectable <> OLD.is_selectable THEN
            RAISE EXCEPTION 'Não é permitido mover um item de atividade (%) de grupo/pai nem alterar sua natureza selecionável/agrupadora.',
                OLD.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- Bloqueia a transferência de um grupo de atividades para outro curso após sua criação.
CREATE TRIGGER trg_activity_groups_immutable_course
BEFORE UPDATE ON app.activity_groups
FOR EACH ROW EXECUTE FUNCTION app.fn_prevent_scoring_structure_move();

-- Bloqueia a alteração de grupo, item-pai ou flag is_selectable de um item da tabela de pontuação.
CREATE TRIGGER trg_activity_items_immutable_group
BEFORE UPDATE ON app.activity_items
FOR EACH ROW EXECUTE FUNCTION app.fn_prevent_scoring_structure_move();

-- Atualiza automaticamente a coluna updated_at sempre que uma oportunidade do mural for modificada.
CREATE TRIGGER trg_opportunities_touch_updated_at
BEFORE UPDATE ON app.opportunities
FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

-- Função que garante que o papel principal (primary_role) do usuário esteja sempre registrado em app.user_roles.
CREATE OR REPLACE FUNCTION app.fn_sync_primary_user_role()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO app.user_roles (user_id, role)
    VALUES (NEW.id, NEW.primary_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEW;
END;
$$;

-- Sincroniza automaticamente o primary_role em app.user_roles após criar ou atualizar um usuário.
CREATE TRIGGER trg_users_sync_primary_role
AFTER INSERT OR UPDATE OF primary_role ON app.users
FOR EACH ROW EXECUTE FUNCTION app.fn_sync_primary_user_role();

-- Função que implementa controle de concorrência otimista exigindo incremento de row_version a cada UPDATE.
CREATE OR REPLACE FUNCTION app.fn_enforce_optimistic_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.row_version <> OLD.row_version + 1 THEN
        RAISE EXCEPTION 'Conflito de concorrência detectado no registro % (versão atual: %, versão enviada: %).',
            OLD.id, OLD.row_version, NEW.row_version
            USING ERRCODE = '40001';
    END IF;
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

-- Aplica o controle de bloqueio otimista (row_version) antes de qualquer atualização em submissões.
CREATE TRIGGER trg_submissions_optimistic_lock
BEFORE UPDATE ON app.submissions
FOR EACH ROW EXECUTE FUNCTION app.fn_enforce_optimistic_lock();

-- Função principal que valida máquina de estados, snapshot de regras, datas de ingresso/trancamento e teto semestral.
CREATE OR REPLACE FUNCTION app.fn_validate_submission_and_semester_cap()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_actor_id BIGINT;
    v_enrollment_student_id BIGINT;
    v_enrollment_course_id BIGINT;
    v_enrollment_date DATE;
    v_enrollment_status VARCHAR(20);
    v_course_prac_id BIGINT;
    v_item_course_id BIGINT;
    v_item_active BOOLEAN;
    v_group_active BOOLEAN;
    v_parent_active BOOLEAN;
    v_points_per_unit NUMERIC(5,2);
    v_unit_name VARCHAR(40);
    v_cap_item_id BIGINT;
    v_max_sem NUMERIC(5,2);
    v_current_semester_sum NUMERIC(6,2);
    v_raw_points NUMERIC(6,2);
    v_expected_direct_points NUMERIC(6,2);
    v_derived_semester CHAR(6);
BEGIN
    v_actor_id := NULLIF(current_setting('app.current_user_id', TRUE), '')::BIGINT;

    SELECT e.student_id, e.course_id, e.enrollment_date, e.status, c.prac_professor_id
      INTO v_enrollment_student_id, v_enrollment_course_id, v_enrollment_date, v_enrollment_status, v_course_prac_id
      FROM app.enrollments e
      JOIN app.courses c ON c.id = e.course_id
     WHERE e.id = NEW.enrollment_id
       FOR UPDATE OF e;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('enrollment:' || NEW.enrollment_id::text, 0)
    );

    IF v_enrollment_status = 'COMPLETED' OR EXISTS (
        SELECT 1 FROM app.homologations h WHERE h.enrollment_id = NEW.enrollment_id
    ) THEN
        RAISE EXCEPTION 'A matrícula % já está concluída/homologada; suas submissões estão congeladas.', NEW.enrollment_id;
    END IF;

    IF v_enrollment_status = 'CANCELED' THEN
        IF TG_OP = 'UPDATE' AND NEW.status = 'CANCELED'
           AND OLD.status IN ('PENDING', 'CORRECTION_REQUESTED')
           AND (v_actor_id IS NULL OR v_actor_id = v_enrollment_student_id) THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Operação não permitida: a matrícula % está com status CANCELED.', NEW.enrollment_id;
    END IF;

    v_derived_semester := EXTRACT(YEAR FROM NEW.activity_end_date)::text || '.' ||
                          CASE WHEN EXTRACT(MONTH FROM NEW.activity_end_date) <= 6 THEN '1' ELSE '2' END;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'PENDING' THEN
            RAISE EXCEPTION 'Novas submissões devem iniciar obrigatoriamente com status PENDING.';
        END IF;
        IF v_actor_id IS NOT NULL AND v_actor_id <> v_enrollment_student_id THEN
            RAISE EXCEPTION 'Apenas o próprio estudante titular da matrícula pode criar uma submissão.';
        END IF;
        NEW.semester := v_derived_semester;
        NEW.original_activity_item_id := NEW.activity_item_id;
        NEW.original_semester := v_derived_semester;
        NEW.original_declared_quantity := NEW.declared_quantity;
        NEW.was_adjusted := FALSE;
        NEW.validated_quantity := NULL;
        NEW.approved_points := NULL;
        NEW.evaluator_id := NULL;
        NEW.evaluated_at := NULL;
    ELSE
        IF NEW.enrollment_id <> OLD.enrollment_id THEN
            RAISE EXCEPTION 'Não é permitido transferir uma submissão para outra matrícula.';
        END IF;

        IF OLD.status = 'CANCELED' THEN
            RAISE EXCEPTION 'Submissões canceladas (CANCELED) são finais e não podem ser alteradas.';
        ELSIF OLD.status = 'PENDING' THEN
            IF NEW.status IN ('PENDING', 'CANCELED') THEN
                IF v_actor_id IS NOT NULL AND v_actor_id <> v_enrollment_student_id THEN
                    RAISE EXCEPTION 'Apenas o estudante titular da matrícula pode editar ou cancelar uma submissão pendente.';
                END IF;
                IF NEW.status = 'PENDING' THEN
                    NEW.semester := v_derived_semester;
                    NEW.original_activity_item_id := NEW.activity_item_id;
                    NEW.original_semester := v_derived_semester;
                    NEW.original_declared_quantity := NEW.declared_quantity;
                END IF;
            END IF;
        ELSIF OLD.status = 'CORRECTION_REQUESTED' THEN
            IF NEW.status IN ('PENDING', 'CANCELED') THEN
                IF v_actor_id IS NOT NULL AND v_actor_id <> v_enrollment_student_id THEN
                    RAISE EXCEPTION 'Apenas o estudante titular da matrícula pode reenviar ou cancelar uma submissão em CORRECTION_REQUESTED.';
                END IF;
                IF NEW.status = 'PENDING' THEN
                    NEW.semester := v_derived_semester;
                    NEW.original_activity_item_id := NEW.activity_item_id;
                    NEW.original_semester := v_derived_semester;
                    NEW.original_declared_quantity := NEW.declared_quantity;
                    NEW.evaluator_id := NULL;
                    NEW.evaluated_at := NULL;
                    NEW.evaluator_feedback := NULL;
                    NEW.was_adjusted := FALSE;
                    NEW.validated_quantity := NULL;
                    NEW.approved_points := NULL;
                END IF;
            ELSE
                IF NEW.evaluator_feedback IS NULL OR length(trim(NEW.evaluator_feedback)) = 0
                   OR NEW.evaluator_feedback IS NOT DISTINCT FROM OLD.evaluator_feedback THEN
                    RAISE EXCEPTION 'A revisão de parecer pelo docente a partir de CORRECTION_REQUESTED (RN007) exige uma nova justificativa em evaluator_feedback.';
                END IF;
            END IF;
        ELSIF OLD.status IN ('APPROVED', 'APPROVED_WITH_ADJUSTMENTS', 'REJECTED') THEN
            IF NEW.status IN ('PENDING', 'CANCELED') THEN
                RAISE EXCEPTION 'Transição proibida (% -> %): atividades já avaliadas ou indeferidas não podem voltar para fila ou ser canceladas.',
                    OLD.status, NEW.status;
            END IF;
            IF NEW.evaluator_feedback IS NULL OR length(trim(NEW.evaluator_feedback)) = 0
               OR NEW.evaluator_feedback IS NOT DISTINCT FROM OLD.evaluator_feedback THEN
                RAISE EXCEPTION 'A revisão de parecer pelo docente (RN007) exige uma nova justificativa em evaluator_feedback.';
            END IF;
        END IF;

        IF NEW.status <> 'PENDING' THEN
            NEW.original_activity_item_id := OLD.original_activity_item_id;
            NEW.original_semester := OLD.original_semester;
            NEW.original_declared_quantity := OLD.original_declared_quantity;
            NEW.declared_quantity := OLD.declared_quantity;
            NEW.description := OLD.description;
            NEW.activity_start_date := OLD.activity_start_date;
            NEW.activity_end_date := OLD.activity_end_date;
            NEW.file_path := OLD.file_path;
            NEW.file_ext := OLD.file_ext;
            NEW.mime_type := OLD.mime_type;
            NEW.file_size_bytes := OLD.file_size_bytes;
            NEW.file_hash_sha256 := OLD.file_hash_sha256;
        END IF;

        IF NEW.status = 'APPROVED' THEN
            NEW.was_adjusted := FALSE;
            NEW.validated_quantity := NEW.declared_quantity;
            NEW.evaluated_at := CURRENT_TIMESTAMP;
        ELSIF NEW.status = 'APPROVED_WITH_ADJUSTMENTS' THEN
            NEW.was_adjusted := TRUE;
            NEW.validated_quantity := COALESCE(NEW.validated_quantity, NEW.declared_quantity);
            NEW.evaluated_at := CURRENT_TIMESTAMP;
        ELSIF NEW.status IN ('CORRECTION_REQUESTED', 'REJECTED') THEN
            NEW.was_adjusted := FALSE;
            NEW.validated_quantity := NULL;
            NEW.approved_points := NULL;
            NEW.evaluated_at := CURRENT_TIMESTAMP;
        ELSIF NEW.status = 'CANCELED' THEN
            NEW.was_adjusted := FALSE;
            NEW.validated_quantity := NULL;
            NEW.approved_points := NULL;
        END IF;
    END IF;

    SELECT g.course_id,
           i.is_active,
           g.is_active,
           COALESCE(p.is_active, TRUE),
           i.points_per_unit,
           i.unit_name,
           COALESCE(i.parent_item_id, i.id),
           COALESCE(p.max_points_semester, i.max_points_semester)
      INTO v_item_course_id,
           v_item_active,
           v_group_active,
           v_parent_active,
           v_points_per_unit,
           v_unit_name,
           v_cap_item_id,
           v_max_sem
      FROM app.activity_items i
      JOIN app.activity_groups g ON g.id = i.group_id
      LEFT JOIN app.activity_items p ON p.id = i.parent_item_id
     WHERE i.id = NEW.activity_item_id;

    IF v_item_course_id <> v_enrollment_course_id THEN
        RAISE EXCEPTION 'O item de atividade selecionado (%) não pertence ao curso da matrícula do estudante.', NEW.activity_item_id;
    END IF;

    IF TG_OP = 'INSERT' OR NEW.activity_item_id <> OLD.activity_item_id OR NEW.status = 'PENDING' THEN
        IF NOT (v_item_active AND v_group_active AND v_parent_active) THEN
            RAISE EXCEPTION 'Não é possível submeter ou reenquadrar em um item ou grupo inativo.';
        END IF;
        NEW.applied_points_per_unit := v_points_per_unit;
        NEW.applied_unit_name := v_unit_name;
        NEW.applied_max_points_semester := v_max_sem;
    ELSE
        NEW.applied_points_per_unit := OLD.applied_points_per_unit;
        NEW.applied_unit_name := OLD.applied_unit_name;
        NEW.applied_max_points_semester := OLD.applied_max_points_semester;
    END IF;

    IF NEW.status IN ('APPROVED', 'APPROVED_WITH_ADJUSTMENTS', 'CORRECTION_REQUESTED', 'REJECTED') THEN
        NEW.evaluator_id := COALESCE(NEW.evaluator_id, v_actor_id);
        IF NEW.evaluator_id IS DISTINCT FROM v_course_prac_id
           OR (v_actor_id IS NOT NULL AND v_actor_id IS DISTINCT FROM v_course_prac_id) THEN
            RAISE EXCEPTION 'Apenas o Docente Responsável (PRAC) titular do curso (%) pode avaliar submissões desta matrícula.',
                v_course_prac_id;
        END IF;
        IF NEW.evaluator_id = v_enrollment_student_id THEN
            RAISE EXCEPTION 'Conflito de interesse proibido: o avaliador (%) não pode avaliar submissões da própria matrícula.',
                NEW.evaluator_id;
        END IF;
    END IF;

    IF NEW.activity_start_date < v_enrollment_date THEN
        RAISE EXCEPTION 'Atividade realizada em % é anterior à data de ingresso no curso (%).',
            NEW.activity_start_date, v_enrollment_date;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM app.enrollment_suspensions s
         WHERE s.enrollment_id = NEW.enrollment_id
           AND daterange(s.start_date, s.end_date, '[]') && daterange(NEW.activity_start_date, NEW.activity_end_date, '[]')
    ) THEN
        RAISE EXCEPTION 'O período da atividade (% a %) coincide com um período de trancamento de matrícula.',
            NEW.activity_start_date, NEW.activity_end_date;
    END IF;

    IF NEW.status IN ('APPROVED', 'APPROVED_WITH_ADJUSTMENTS') THEN
        v_raw_points := ROUND(NEW.declared_quantity * NEW.applied_points_per_unit, 2);

        IF NEW.applied_max_points_semester IS NOT NULL THEN
            PERFORM pg_advisory_xact_lock(
                hashtextextended('semcap:' || NEW.enrollment_id::text || ':' || NEW.semester || ':' || v_cap_item_id::text, 0)
            );

            SELECT COALESCE(SUM(s.approved_points), 0.00)
              INTO v_current_semester_sum
              FROM app.submissions s
              JOIN app.activity_items idx_i ON idx_i.id = s.activity_item_id
             WHERE s.enrollment_id = NEW.enrollment_id
               AND s.semester = NEW.semester
               AND s.status IN ('APPROVED', 'APPROVED_WITH_ADJUSTMENTS')
               AND COALESCE(idx_i.parent_item_id, idx_i.id) = v_cap_item_id
               AND (TG_OP = 'INSERT' OR s.id <> NEW.id);

            v_expected_direct_points := LEAST(v_raw_points, GREATEST(NEW.applied_max_points_semester - v_current_semester_sum, 0.00));
        ELSE
            v_expected_direct_points := v_raw_points;
        END IF;

        IF NEW.status = 'APPROVED' THEN
            NEW.approved_points := COALESCE(NEW.approved_points, v_expected_direct_points);

            IF NEW.approved_points <= 0 THEN
                RAISE EXCEPTION 'O teto máximo semestral (%) para esta modalidade já foi integralmente atingido no semestre %.',
                    NEW.applied_max_points_semester, NEW.semester;
            END IF;

            IF NEW.approved_points <> v_expected_direct_points THEN
                RAISE EXCEPTION 'Em aprovação direta (APPROVED), approved_points (%) deve ser igual aos pontos calculados respeitando o teto semestral restante (%). Para ajustes manuais, utilize APPROVED_WITH_ADJUSTMENTS.',
                    NEW.approved_points, v_expected_direct_points;
            END IF;

            IF NEW.approved_points < v_raw_points
               AND (NEW.evaluator_feedback IS NULL OR length(trim(NEW.evaluator_feedback)) = 0) THEN
                NEW.evaluator_feedback := 'Pontuação limitada pelo teto máximo semestral da modalidade (RN006).';
            END IF;
        END IF;

        IF NEW.applied_max_points_semester IS NOT NULL
           AND (v_current_semester_sum + NEW.approved_points) > NEW.applied_max_points_semester THEN
            RAISE EXCEPTION 'Limite semestral excedido para esta modalidade no semestre % (Acumulado: %, Tentativa: %, Máx./Sem.: %).',
                NEW.semester, v_current_semester_sum, NEW.approved_points, NEW.applied_max_points_semester;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Dispara a validação completa de submissão e cálculo de teto semestral antes de inserir ou atualizar em app.submissions.
CREATE TRIGGER trg_submissions_validate_all
BEFORE INSERT OR UPDATE ON app.submissions
FOR EACH ROW EXECUTE FUNCTION app.fn_validate_submission_and_semester_cap();

-- Função que impede registrar trancamentos em matrículas inativas ou sobrepondo atividades complementares já enviadas.
CREATE OR REPLACE FUNCTION app.fn_check_suspension_against_submissions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_enrollment_status VARCHAR(20);
BEGIN
    SELECT e.status
      INTO v_enrollment_status
      FROM app.enrollments e
     WHERE e.id = NEW.enrollment_id
       FOR UPDATE OF e;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('enrollment:' || NEW.enrollment_id::text, 0)
    );

    IF v_enrollment_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Não é possível registrar ou alterar trancamento em matrícula com status %.', v_enrollment_status;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM app.submissions s
         WHERE s.enrollment_id = NEW.enrollment_id
           AND s.status NOT IN ('REJECTED', 'CANCELED')
           AND daterange(s.activity_start_date, s.activity_end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
    ) THEN
        RAISE EXCEPTION 'Não é possível registrar trancamento entre % e % pois já existem submissões ativas/aprovadas nesse período.',
            NEW.start_date, NEW.end_date;
    END IF;
    RETURN NEW;
END;
$$;

-- Valida conflitos com submissões existentes antes de inserir ou atualizar períodos de trancamento.
CREATE TRIGGER trg_suspensions_check_submissions
BEFORE INSERT OR UPDATE ON app.enrollment_suspensions
FOR EACH ROW EXECUTE FUNCTION app.fn_check_suspension_against_submissions();

-- Função que valida se o grupo consolidado na homologação pertence ao mesmo curso da matrícula homologada.
CREATE OR REPLACE FUNCTION app.fn_validate_homologation_group_course()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_enrollment_course_id BIGINT;
    v_group_course_id BIGINT;
BEGIN
    SELECT e.course_id
      INTO v_enrollment_course_id
      FROM app.homologations h
      JOIN app.enrollments e ON e.id = h.enrollment_id
     WHERE h.id = NEW.homologation_id;

    SELECT g.course_id
      INTO v_group_course_id
      FROM app.activity_groups g
     WHERE g.id = NEW.group_id;

    IF v_enrollment_course_id <> v_group_course_id THEN
        RAISE EXCEPTION 'O grupo % não pertence ao mesmo curso da matrícula homologada.', NEW.group_id;
    END IF;

    RETURN NEW;
END;
$$;

-- Garante a coerência entre curso do grupo e curso da matrícula antes de gravar pontuações de grupos na homologação.
CREATE TRIGGER trg_hgs_validate_course
BEFORE INSERT OR UPDATE ON app.homologation_group_scores
FOR EACH ROW EXECUTE FUNCTION app.fn_validate_homologation_group_course();

-- Função transacional SECURITY DEFINER que afere os requisitos por grupo e total, registra a homologação e conclui a matrícula.
CREATE OR REPLACE FUNCTION app.fn_register_homologation(
    p_enrollment_id BIGINT,
    p_professor_id BIGINT,
    p_report_pdf_path VARCHAR(500),
    p_report_pdf_hash CHAR(64)
)
RETURNS BIGINT
SECURITY DEFINER
SET search_path = app, audit, public, pg_temp
LANGUAGE plpgsql AS $$
DECLARE
    v_actor_id BIGINT;
    v_student_id BIGINT;
    v_course_id BIGINT;
    v_enrollment_status VARCHAR(20);
    v_course_prac_id BIGINT;
    v_min_total_points NUMERIC(6,2);
    v_total_approved NUMERIC(6,2) := 0.00;
    v_homologation_id BIGINT;
    v_active_groups_count INT := 0;
    r_group RECORD;
BEGIN
    v_actor_id := NULLIF(current_setting('app.current_user_id', TRUE), '')::BIGINT;
    IF v_actor_id IS NOT NULL AND v_actor_id <> p_professor_id THEN
        RAISE EXCEPTION 'O usuário autenticado na sessão (%) não corresponde ao professor homologador (%).',
            v_actor_id, p_professor_id;
    END IF;

    SELECT e.student_id, e.course_id, e.status, c.prac_professor_id, c.min_total_points
      INTO v_student_id, v_course_id, v_enrollment_status, v_course_prac_id, v_min_total_points
      FROM app.enrollments e
      JOIN app.courses c ON c.id = e.course_id
     WHERE e.id = p_enrollment_id
       FOR UPDATE OF e;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Matrícula % não encontrada.', p_enrollment_id;
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('enrollment:' || p_enrollment_id::text, 0)
    );

    IF v_enrollment_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Apenas matrículas ACTIVE podem ser homologadas (status atual: %).', v_enrollment_status;
    END IF;

    IF p_professor_id IS DISTINCT FROM v_course_prac_id THEN
        RAISE EXCEPTION 'Apenas o Docente Responsável (PRAC) titular do curso (%) pode homologar esta matrícula.',
            v_course_prac_id;
    END IF;

    IF p_professor_id = v_student_id THEN
        RAISE EXCEPTION 'Conflito de interesse proibido: o professor (%) não pode homologar a própria matrícula.',
            p_professor_id;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM app.submissions s
         WHERE s.enrollment_id = p_enrollment_id
           AND s.status IN ('PENDING', 'CORRECTION_REQUESTED')
    ) THEN
        RAISE EXCEPTION 'Não é possível homologar a matrícula % enquanto existirem submissões pendentes de avaliação ou correção.',
            p_enrollment_id;
    END IF;

    FOR r_group IN
        SELECT g.id AS group_id,
               g.group_number,
               g.min_points,
               COALESCE(SUM(s.approved_points), 0.00) AS group_approved_points
          FROM app.activity_groups g
          LEFT JOIN app.activity_items i ON i.group_id = g.id
          LEFT JOIN app.submissions s
                 ON s.activity_item_id = i.id
                AND s.enrollment_id = p_enrollment_id
                AND s.status IN ('APPROVED', 'APPROVED_WITH_ADJUSTMENTS')
         WHERE g.course_id = v_course_id
           AND g.is_active = TRUE
         GROUP BY g.id, g.group_number, g.min_points
         ORDER BY g.group_number
    LOOP
        v_active_groups_count := v_active_groups_count + 1;

        IF r_group.group_approved_points < r_group.min_points THEN
            RAISE EXCEPTION 'Requisitos não atingidos no Grupo %: aprovado = % pts, mínimo exigido = % pts.',
                r_group.group_number, r_group.group_approved_points, r_group.min_points;
        END IF;

        v_total_approved := v_total_approved + r_group.group_approved_points;
    END LOOP;

    IF v_active_groups_count = 0 THEN
        RAISE EXCEPTION 'O curso % não possui grupos de atividades ativos configurados.', v_course_id;
    END IF;

    IF v_total_approved < v_min_total_points THEN
        RAISE EXCEPTION 'Pontuação total insuficiente para homologação: total aprovado = % pts, mínimo exigido = % pts.',
            v_total_approved, v_min_total_points;
    END IF;

    INSERT INTO app.homologations (
        enrollment_id,
        total_approved_points,
        required_min_total_points,
        report_pdf_path,
        report_pdf_hash_sha256,
        homologated_by_id
    ) VALUES (
        p_enrollment_id,
        v_total_approved,
        v_min_total_points,
        p_report_pdf_path,
        p_report_pdf_hash,
        p_professor_id
    ) RETURNING id INTO v_homologation_id;

    INSERT INTO app.homologation_group_scores (
        homologation_id,
        group_id,
        approved_points,
        required_min_points
    )
    SELECT v_homologation_id,
           g.id,
           COALESCE(SUM(s.approved_points), 0.00),
           g.min_points
      FROM app.activity_groups g
      LEFT JOIN app.activity_items i ON i.group_id = g.id
      LEFT JOIN app.submissions s
             ON s.activity_item_id = i.id
            AND s.enrollment_id = p_enrollment_id
            AND s.status IN ('APPROVED', 'APPROVED_WITH_ADJUSTMENTS')
     WHERE g.course_id = v_course_id
       AND g.is_active = TRUE
     GROUP BY g.id, g.min_points;

    UPDATE app.enrollments
       SET status = 'COMPLETED',
           updated_at = CURRENT_TIMESTAMP
     WHERE id = p_enrollment_id;

    RETURN v_homologation_id;
END;
$$;

-- Função SECURITY DEFINER que grava automaticamente em audit.audit_logs as criações, avaliações e revisões de submissões.
CREATE OR REPLACE FUNCTION audit.fn_auto_audit_submissions()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = audit, app, public, pg_temp
LANGUAGE plpgsql AS $$
DECLARE
    v_actor_id BIGINT;
    v_client_ip INET;
    v_action VARCHAR(40);
BEGIN
    v_actor_id := NULLIF(current_setting('app.current_user_id', TRUE), '')::BIGINT;
    v_client_ip := NULLIF(current_setting('app.client_ip', TRUE), '')::INET;

    IF TG_OP = 'INSERT' THEN
        IF v_actor_id IS NULL THEN
            SELECT e.student_id INTO v_actor_id FROM app.enrollments e WHERE e.id = NEW.enrollment_id;
        END IF;

        INSERT INTO audit.audit_logs (
            entity_type, entity_id, action, actor_id, ip_address,
            previous_status, new_status, before_snapshot, after_snapshot, notes
        ) VALUES (
            'SUBMISSION', NEW.id, 'CREATED', v_actor_id, v_client_ip,
            NULL, NEW.status, NULL, to_jsonb(NEW), NULL
        );
        RETURN NEW;
    END IF;

    v_actor_id := COALESCE(v_actor_id, NEW.evaluator_id);
    IF v_actor_id IS NULL THEN
        SELECT e.student_id INTO v_actor_id FROM app.enrollments e WHERE e.id = NEW.enrollment_id;
    END IF;

    IF OLD.status IN ('APPROVED', 'APPROVED_WITH_ADJUSTMENTS', 'REJECTED', 'CORRECTION_REQUESTED')
       AND NEW.status IN ('APPROVED', 'APPROVED_WITH_ADJUSTMENTS', 'REJECTED', 'CORRECTION_REQUESTED')
       AND (
           NEW.status <> OLD.status
           OR NEW.approved_points IS DISTINCT FROM OLD.approved_points
           OR NEW.activity_item_id IS DISTINCT FROM OLD.activity_item_id
           OR NEW.semester IS DISTINCT FROM OLD.semester
           OR NEW.validated_quantity IS DISTINCT FROM OLD.validated_quantity
       ) THEN
        v_action := 'OPINION_REVISED';
    ELSIF NEW.status IN ('APPROVED', 'APPROVED_WITH_ADJUSTMENTS', 'CORRECTION_REQUESTED', 'REJECTED', 'CANCELED')
          AND NEW.status <> OLD.status THEN
        v_action := NEW.status;
    ELSE
        v_action := 'UPDATED';
    END IF;

    INSERT INTO audit.audit_logs (
        entity_type, entity_id, action, actor_id, ip_address,
        previous_status, new_status, before_snapshot, after_snapshot, notes
    ) VALUES (
        'SUBMISSION', NEW.id, v_action, v_actor_id, v_client_ip,
        OLD.status, NEW.status, to_jsonb(OLD), to_jsonb(NEW), NEW.evaluator_feedback
    );

    RETURN NEW;
END;
$$;

-- Aciona a gravação automática de auditoria após inserir ou atualizar registros em app.submissions.
CREATE TRIGGER trg_submissions_auto_audit
AFTER INSERT OR UPDATE ON app.submissions
FOR EACH ROW EXECUTE FUNCTION audit.fn_auto_audit_submissions();

-- Função SECURITY DEFINER que audita a criação de homologações e as atualizações de sincronização com o Portal UTFPR.
CREATE OR REPLACE FUNCTION audit.fn_auto_audit_homologations()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = audit, app, public, pg_temp
LANGUAGE plpgsql AS $$
DECLARE
    v_actor_id BIGINT;
    v_client_ip INET;
BEGIN
    v_actor_id := NULLIF(current_setting('app.current_user_id', TRUE), '')::BIGINT;
    v_client_ip := NULLIF(current_setting('app.client_ip', TRUE), '')::INET;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit.audit_logs (
            entity_type, entity_id, action, actor_id, ip_address,
            previous_status, new_status, before_snapshot, after_snapshot, notes
        ) VALUES (
            'HOMOLOGATION', NEW.id, 'HOMOLOGATED', COALESCE(v_actor_id, NEW.homologated_by_id), v_client_ip,
            NULL, NEW.portal_sync_status, NULL, to_jsonb(NEW), NULL
        );
    ELSIF TG_OP = 'UPDATE' AND NEW.portal_sync_status IS DISTINCT FROM OLD.portal_sync_status THEN
        INSERT INTO audit.audit_logs (
            entity_type, entity_id, action, actor_id, ip_address,
            previous_status, new_status, before_snapshot, after_snapshot, notes
        ) VALUES (
            'HOMOLOGATION', NEW.id, 'PORTAL_SYNC_UPDATED', v_actor_id, v_client_ip,
            OLD.portal_sync_status, NEW.portal_sync_status, to_jsonb(OLD), to_jsonb(NEW), NEW.portal_error_log
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Aciona a auditoria automática após inserir ou atualizar registros em app.homologations.
CREATE TRIGGER trg_homologations_auto_audit
AFTER INSERT OR UPDATE ON app.homologations
FOR EACH ROW EXECUTE FUNCTION audit.fn_auto_audit_homologations();

-- Função SECURITY DEFINER que audita automaticamente mudanças em papéis, itens de pontuação, matrículas e cursos.
CREATE OR REPLACE FUNCTION audit.fn_auto_audit_domain_entities()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = audit, app, public, pg_temp
LANGUAGE plpgsql AS $$
DECLARE
    v_actor_id BIGINT;
    v_client_ip INET;
BEGIN
    v_actor_id := NULLIF(current_setting('app.current_user_id', TRUE), '')::BIGINT;
    v_client_ip := NULLIF(current_setting('app.client_ip', TRUE), '')::INET;

    IF TG_TABLE_NAME = 'user_roles' THEN
        IF TG_OP = 'INSERT' THEN
            INSERT INTO audit.audit_logs (
                entity_type, entity_id, action, actor_id, ip_address, after_snapshot
            ) VALUES (
                'USER_ROLE', NEW.user_id, 'ROLE_GRANTED', COALESCE(v_actor_id, NEW.user_id), v_client_ip, to_jsonb(NEW)
            );
            RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
            INSERT INTO audit.audit_logs (
                entity_type, entity_id, action, actor_id, ip_address, before_snapshot
            ) VALUES (
                'USER_ROLE', OLD.user_id, 'ROLE_REVOKED', v_actor_id, v_client_ip, to_jsonb(OLD)
            );
            RETURN OLD;
        END IF;
    ELSIF TG_TABLE_NAME = 'activity_items' THEN
        INSERT INTO audit.audit_logs (
            entity_type, entity_id, action, actor_id, ip_address, before_snapshot, after_snapshot
        ) VALUES (
            'SCORING_ITEM', NEW.id, CASE WHEN TG_OP = 'INSERT' THEN 'CREATED' ELSE 'UPDATED' END,
            v_actor_id, v_client_ip, CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_TABLE_NAME = 'enrollments' THEN
        INSERT INTO audit.audit_logs (
            entity_type, entity_id, action, actor_id, ip_address,
            previous_status, new_status, before_snapshot, after_snapshot
        ) VALUES (
            'ENROLLMENT', NEW.id,
            CASE
                WHEN TG_OP = 'INSERT' THEN 'CREATED'
                WHEN NEW.status = 'COMPLETED' AND OLD.status <> 'COMPLETED' THEN 'COMPLETED'
                WHEN NEW.status = 'CANCELED' AND OLD.status <> 'CANCELED' THEN 'CANCELED'
                ELSE 'UPDATED'
            END,
            COALESCE(v_actor_id, NEW.student_id), v_client_ip,
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END, NEW.status,
            CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_TABLE_NAME = 'courses' THEN
        INSERT INTO audit.audit_logs (
            entity_type, entity_id, action, actor_id, ip_address, before_snapshot, after_snapshot
        ) VALUES (
            'COURSE', NEW.id, CASE WHEN TG_OP = 'INSERT' THEN 'CREATED' ELSE 'UPDATED' END,
            v_actor_id, v_client_ip,
            CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW)
        );
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$;

-- Audita automaticamente a concessão e revogação de papéis na tabela app.user_roles.
CREATE TRIGGER trg_user_roles_auto_audit
AFTER INSERT OR DELETE ON app.user_roles
FOR EACH ROW EXECUTE FUNCTION audit.fn_auto_audit_domain_entities();

-- Audita automaticamente a criação e customização de itens da tabela de pontuação em app.activity_items.
CREATE TRIGGER trg_activity_items_auto_audit
AFTER INSERT OR UPDATE ON app.activity_items
FOR EACH ROW EXECUTE FUNCTION audit.fn_auto_audit_domain_entities();

-- Audita automaticamente a criação e mudanças de status de matrículas em app.enrollments.
CREATE TRIGGER trg_enrollments_auto_audit
AFTER INSERT OR UPDATE ON app.enrollments
FOR EACH ROW EXECUTE FUNCTION audit.fn_auto_audit_domain_entities();

-- Audita automaticamente o cadastro e alterações de PRAC/Coordenação nos cursos em app.courses.
CREATE TRIGGER trg_courses_auto_audit
AFTER INSERT OR UPDATE ON app.courses
FOR EACH ROW EXECUTE FUNCTION audit.fn_auto_audit_domain_entities();

-- Índice para acelerar buscas e joins de usuários por campus.
CREATE INDEX idx_users_campus_id ON app.users (campus_id);

-- Índice para acelerar filtros de permissões pelo tipo de papel em app.user_roles.
CREATE INDEX idx_user_roles_role ON app.user_roles (role);

-- Índice para acelerar buscas de cursos pelo coordenador responsável.
CREATE INDEX idx_courses_coordinator_id ON app.courses (coordinator_id);

-- Índice para acelerar buscas de cursos pelo docente responsável pelas ACs (PRAC).
CREATE INDEX idx_courses_prac_id ON app.courses (prac_professor_id);

-- Índice para acelerar a listagem de todas as matrículas de um estudante.
CREATE INDEX idx_enrollments_student_id ON app.enrollments (student_id);

-- Índice para acelerar a listagem de matrículas por curso nos painéis gerenciais.
CREATE INDEX idx_enrollments_course_id ON app.enrollments (course_id);

-- Índice para acelerar a verificação de períodos de trancamento de uma matrícula.
CREATE INDEX idx_suspensions_enrollment_id ON app.enrollment_suspensions (enrollment_id);

-- Índice parcial para acelerar a busca de subitens filhos a partir de um item agrupador pai.
CREATE INDEX idx_items_parent_id ON app.activity_items (parent_item_id) WHERE parent_item_id IS NOT NULL;

-- Índice composto para otimizar o cálculo de teto semestral e o extrato do estudante por semestre e status.
CREATE INDEX idx_submissions_enrollment_sem_status ON app.submissions (enrollment_id, semester, status);

-- Índice para acelerar joins e verificações de submissões por item de atividade.
CREATE INDEX idx_submissions_item_id ON app.submissions (activity_item_id);

-- Índice para acelerar consultas pelo item originalmente submetido pelo estudante.
CREATE INDEX idx_submissions_orig_item_id ON app.submissions (original_activity_item_id);

-- Índice parcial para acelerar consultas de atividades avaliadas por um docente específico.
CREATE INDEX idx_submissions_evaluator_id ON app.submissions (evaluator_id) WHERE evaluator_id IS NOT NULL;

-- Índice parcial ordenado para acelerar a fila de avaliação de submissões pendentes.
CREATE INDEX idx_submissions_pending_queue ON app.submissions (created_at) WHERE status = 'PENDING';

-- Índice para acelerar a consulta de homologações realizadas por um docente específico.
CREATE INDEX idx_homologations_professor_id ON app.homologations (homologated_by_id);

-- Índice para acelerar agregações de pontuações homologadas por grupo de atividade.
CREATE INDEX idx_hgs_group_id ON app.homologation_group_scores (group_id);

-- Índice parcial para acelerar a listagem de oportunidades ativas priorizadas por campus e data de término.
CREATE INDEX idx_opportunities_active_campus_dates ON app.opportunities (campus_id, end_date) WHERE is_active = TRUE;

-- Índice para acelerar buscas de oportunidades criadas pelo Coordenador do SIAC.
CREATE INDEX idx_opportunities_created_by ON app.opportunities (created_by_id);

-- Índice composto para acelerar a central de notificações não lidas do usuário em ordem decrescente.
CREATE INDEX idx_notifications_recipient_unread ON app.notifications (recipient_id, is_read, created_at DESC);

-- Índice parcial para acelerar a busca de notificações associadas a uma submissão específica.
CREATE INDEX idx_notifications_submission_id ON app.notifications (submission_id) WHERE submission_id IS NOT NULL;

-- Índice composto para acelerar a consulta do histórico de auditoria de qualquer entidade em ordem cronológica reversa.
CREATE INDEX idx_audit_entity ON audit.audit_logs (entity_type, entity_id, created_at DESC);

-- Índice parcial para acelerar a rastreabilidade de ações executadas por um usuário específico na auditoria.
CREATE INDEX idx_audit_actor ON audit.audit_logs (actor_id) WHERE actor_id IS NOT NULL;

-- Restaura a role da sessão para o superusuário/administrador antes de aplicar os controles finais de permissão.
RESET ROLE;

-- Garante explicitamente que o schema app pertence à role proprietária siac_owner.
ALTER SCHEMA app OWNER TO siac_owner;

-- Garante explicitamente que o schema audit pertence à role proprietária siac_owner.
ALTER SCHEMA audit OWNER TO siac_owner;

-- Remove permissões implícitas da role PUBLIC sobre o schema padrão public.
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- Concede permissão de uso do schema app para a role de execução da aplicação.
GRANT USAGE ON SCHEMA app TO siac_app;

-- Concede permissão de uso do schema audit para a role de execução da aplicação.
GRANT USAGE ON SCHEMA audit TO siac_app;

-- Remove quaisquer privilégios residuais sobre as tabelas do schema app antes de conceder as permissões mínimas.
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC, siac_app;

-- Concede leitura, inserção e atualização apenas nas tabelas operacionais do schema app para o backend.
GRANT SELECT, INSERT, UPDATE ON
    app.campuses,
    app.users,
    app.user_roles,
    app.courses,
    app.enrollments,
    app.enrollment_suspensions,
    app.activity_groups,
    app.activity_items,
    app.submissions,
    app.opportunities,
    app.notifications
TO siac_app;

-- Permite a remoção de registros exclusivamente na tabela de associação de papéis secundários (app.user_roles).
GRANT DELETE ON app.user_roles TO siac_app;

-- Concede apenas leitura em homologations e homologation_group_scores, forçando a criação via fn_register_homologation.
GRANT SELECT ON app.homologations, app.homologation_group_scores TO siac_app;

-- Permite atualizar em app.homologations apenas a confirmação do aluno e as colunas de sincronização com o Portal UTFPR.
GRANT UPDATE (student_confirmed_at, portal_sync_status, portal_synced_at, portal_error_log)
    ON app.homologations TO siac_app;

-- Concede uso e leitura das sequências de identidade do schema app para a role da aplicação.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO siac_app;

-- Remove a permissão pública padrão de execução sobre todas as funções do schema app.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;

-- Concede permissão de execução das funções de negócio do schema app para a role da aplicação.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO siac_app;

-- Remove todos os privilégios sobre as tabelas do schema audit de PUBLIC e da aplicação.
REVOKE ALL ON ALL TABLES IN SCHEMA audit FROM PUBLIC, siac_app;

-- Remove a permissão de execução direta das funções internas de trigger do schema audit.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA audit FROM PUBLIC, siac_app;

-- Concede estritamente permissão de leitura (SELECT) na tabela de auditoria para a role da aplicação.
GRANT SELECT ON audit.audit_logs TO siac_app;

-- Define privilégio padrão de SELECT, INSERT e UPDATE para a aplicação em tabelas futuras criadas no schema app.
ALTER DEFAULT PRIVILEGES FOR ROLE siac_owner IN SCHEMA app
    GRANT SELECT, INSERT, UPDATE ON TABLES TO siac_app;

-- Define privilégio padrão de uso de sequências para a aplicação em objetos futuros criados no schema app.
ALTER DEFAULT PRIVILEGES FOR ROLE siac_owner IN SCHEMA app
    GRANT USAGE, SELECT ON SEQUENCES TO siac_app;

-- Bloqueia por padrão a execução pública de novas funções que venham a ser criadas por siac_owner no schema app.
ALTER DEFAULT PRIVILEGES FOR ROLE siac_owner IN SCHEMA app
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Define privilégio padrão estrito de leitura (SELECT) para a aplicação em tabelas futuras criadas no schema audit.
ALTER DEFAULT PRIVILEGES FOR ROLE siac_owner IN SCHEMA audit
    GRANT SELECT ON TABLES TO siac_app;

-- Bloqueia por padrão a execução pública de novas funções que venham a ser criadas por siac_owner no schema audit.
ALTER DEFAULT PRIVILEGES FOR ROLE siac_owner IN SCHEMA audit
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
