-- Estado del proceso de desvinculación de un trabajador.
-- Reemplaza el sessionStorage `finiquito_${rut}` del frontend y registra los hitos
-- del proceso: generación de carta, generación de finiquito y aviso a RRHH.

CREATE TABLE IF NOT EXISTS app.desvinculacion_proceso (
    id                      SERIAL PRIMARY KEY,
    rut                     VARCHAR(20) NOT NULL UNIQUE,  -- un proceso vivo por trabajador
    causal                  VARCHAR(50),
    fecha_termino           DATE,
    payload_json            JSONB,                        -- formulario completo de CrearFiniquito
    carta_generada_at       TIMESTAMP WITH TIME ZONE,     -- último click en "GENERAR CARTA"
    finiquito_generado_at   TIMESTAMP WITH TIME ZONE,
    correo_enviado_at       TIMESTAMP WITH TIME ZONE,
    created_by              VARCHAR(100),                 -- username del usuario autenticado
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- El estado ('borrador' | 'carta_generada' | 'finiquito_generado' | 'notificado') se deriva
-- de los timestamps en la capa de servicio; no se guarda como columna para que no pueda
-- quedar desincronizado con ellos.

CREATE INDEX IF NOT EXISTS idx_desvinculacion_updated_at ON app.desvinculacion_proceso(updated_at);
