"""
Migración one-shot: Supabase public.country_config → Postgres calculadora.country_config

Uso:
    export SUPABASE_URL=...
    export SUPABASE_SERVICE_ROLE_KEY=...
    export DB_HOST=host.docker.internal
    export DB_USER=...
    export DB_PASS=...
    python migrate_country_config.py

Es idempotente (ON CONFLICT DO UPDATE), se puede correr varias veces.
"""

import os
from supabase import create_client
import psycopg2
from psycopg2.extras import Json


def main():
    sb = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    rows = sb.table("country_config").select("*").execute().data
    print(f"Filas en Supabase: {len(rows)}")

    conn = psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", 5432)),
        dbname=os.environ.get("DB_NAME", "rh_cramer"),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASS"],
    )
    cur = conn.cursor()

    sql = """
    INSERT INTO calculadora.country_config (
        pais, afp_data, afp_updated_at, uf_value, uf_updated_at,
        tasas, tasas_updated_at, updated_at,
        tax_brackets, tax_brackets_updated_at,
        dolar_value, dolar_updated_at,
        bonos_anuales_uf, bonos_empresa
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (pais) DO UPDATE SET
        afp_data=EXCLUDED.afp_data, afp_updated_at=EXCLUDED.afp_updated_at,
        uf_value=EXCLUDED.uf_value, uf_updated_at=EXCLUDED.uf_updated_at,
        tasas=EXCLUDED.tasas, tasas_updated_at=EXCLUDED.tasas_updated_at,
        updated_at=EXCLUDED.updated_at,
        tax_brackets=EXCLUDED.tax_brackets,
        tax_brackets_updated_at=EXCLUDED.tax_brackets_updated_at,
        dolar_value=EXCLUDED.dolar_value, dolar_updated_at=EXCLUDED.dolar_updated_at,
        bonos_anuales_uf=EXCLUDED.bonos_anuales_uf,
        bonos_empresa=EXCLUDED.bonos_empresa
    """

    for r in rows:
        cur.execute(sql, (
            r["pais"],
            Json(r.get("afp_data")), r.get("afp_updated_at"),
            r.get("uf_value"), r.get("uf_updated_at"),
            Json(r.get("tasas")), r.get("tasas_updated_at"),
            r.get("updated_at"),
            Json(r.get("tax_brackets")), r.get("tax_brackets_updated_at"),
            r.get("dolar_value"), r.get("dolar_updated_at"),
            Json(r.get("bonos_anuales_uf")), Json(r.get("bonos_empresa")),
        ))

    conn.commit()
    cur.close()
    conn.close()
    print(f"Migradas {len(rows)} filas a calculadora.country_config")


if __name__ == "__main__":
    main()
