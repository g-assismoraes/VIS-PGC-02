import { loadDb } from "./config";

/**
 * Classe responsável pela camada de dados do projeto Diplomatrix.
 *
 * O JSON original é hierárquico:
 *
 * Models_Essays
 *   └── ano
 *       └── Models
 *           └── modelo
 *               └── Automatic Metrics
 *                   └── métrica
 *                       └── candidato: valor
 *
 * Para facilitar a análise visual, convertemos essa estrutura em uma tabela longa:
 *
 * ano | modelo | família | temperatura | métrica | avaliador/referência | valor
 *
 * Depois, usamos DuckDB para agregar os valores por modelo e métrica.
 */
export class DiplomatrixData {
  constructor(jsonUrl = "data/Diplomatrix.json") {
    this.jsonUrl = jsonUrl;
  }

  async init() {
    this.db = await loadDb();
    this.conn = await this.db.connect();

    await this.conn.query("SET preserve_insertion_order=false;");
  }

  /**
   * Carrega o JSON, transforma em linhas tabulares e cria as tabelas no DuckDB.
   */
  async load() {
    const response = await fetch(this.jsonUrl);

    if (!response.ok) {
      throw new Error(`Erro ao carregar ${this.jsonUrl}: ${response.status}`);
    }

    const json = await response.json();
    const rows = this.flattenAutomaticMetrics(json);

    await this.createRawTable(rows);

    const yearlySummary = await this.query(`
      SELECT
        CAST(year AS VARCHAR) AS year,
        model_key,
        model_family,
        model_display,
        temperature,
        temperature_label,
        metric,
        AVG(value) AS mean_value,
        STDDEV_SAMP(value) AS std_value,
        MIN(value) AS min_value,
        MAX(value) AS max_value,
        COUNT(*) AS n
      FROM automatic_metrics_raw
      GROUP BY
        year,
        model_key,
        model_family,
        model_display,
        temperature,
        temperature_label,
        metric
      ORDER BY year, model_key, metric;
    `);

    /**
     * Agregação "Todos".
     *
     * Ela junta todos os anos e calcula a média por modelo e métrica.
     * Isso permite comparar os modelos no conjunto completo do recorte.
     */
    const allYearsSummary = await this.query(`
      SELECT
        'Todos' AS year,
        model_key,
        model_family,
        model_display,
        temperature,
        temperature_label,
        metric,
        AVG(value) AS mean_value,
        STDDEV_SAMP(value) AS std_value,
        MIN(value) AS min_value,
        MAX(value) AS max_value,
        COUNT(*) AS n
      FROM automatic_metrics_raw
      GROUP BY
        model_key,
        model_family,
        model_display,
        temperature,
        temperature_label,
        metric
      ORDER BY model_key, metric;
    `);

    const summaryRows = [...allYearsSummary, ...yearlySummary];

    return {
      rawRows: rows,
      summaryRows,
      metrics: [...new Set(summaryRows.map((d) => d.metric))].sort(),
      years: [
        "Todos",
        ...[...new Set(yearlySummary.map((d) => d.year))].sort(),
      ],
      models: [...new Set(summaryRows.map((d) => d.model_key))].sort(),
    };
  }

  /**
   * Converte a estrutura hierárquica do JSON em linhas.
   *
   * Cada valor individual de uma métrica contra uma referência/candidato vira
   * uma linha. A média por modelo e métrica é calculada depois no DuckDB.
   */
  flattenAutomaticMetrics(json) {
    const output = [];
    const modelsEssays = json.Models_Essays ?? {};

    Object.entries(modelsEssays).forEach(([year, yearData]) => {
      const models = yearData?.Models ?? {};

      Object.entries(models).forEach(([modelKey, modelData]) => {
        const automaticMetrics = modelData?.["Automatic Metrics"] ?? {};
        const modelInfo = parseModelKey(modelKey);

        Object.entries(automaticMetrics).forEach(([metric, valuesByRef]) => {
          if (!valuesByRef || typeof valuesByRef !== "object") return;

          Object.entries(valuesByRef).forEach(([referenceName, rawValue]) => {
            const value = Number(rawValue);

            if (!Number.isFinite(value)) return;

            output.push({
              year: Number(year),
              model_key: modelKey,
              model_family: modelInfo.family,
              model_display: modelInfo.display,
              temperature: modelInfo.temperature,
              temperature_label: modelInfo.temperatureLabel,
              metric,
              reference_name: referenceName,
              value,
            });
          });
        });
      });
    });

    return output;
  }

  /**
   * Cria uma tabela DuckDB com as linhas extraídas do JSON.
   *
   * A tabela longa facilita consultas posteriores, porque todas as métricas
   * passam a ter o mesmo formato.
   */
  async createRawTable(rows) {
    await this.conn.query(`
      CREATE OR REPLACE TABLE automatic_metrics_raw (
        year INTEGER,
        model_key VARCHAR,
        model_family VARCHAR,
        model_display VARCHAR,
        temperature DOUBLE,
        temperature_label VARCHAR,
        metric VARCHAR,
        reference_name VARCHAR,
        value DOUBLE
      );
    `);

    if (!rows.length) return;

    /**
     * Inserção em lotes.
     *
     * Isso evita criar uma única query enorme caso o arquivo tenha muitos anos,
     * modelos ou métricas.
     */
    const chunkSize = 1000;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);

      const values = chunk
        .map(
          (r) => `(
            ${sqlNumber(r.year)},
            ${sqlString(r.model_key)},
            ${sqlString(r.model_family)},
            ${sqlString(r.model_display)},
            ${sqlNumber(r.temperature)},
            ${sqlString(r.temperature_label)},
            ${sqlString(r.metric)},
            ${sqlString(r.reference_name)},
            ${sqlNumber(r.value)}
          )`,
        )
        .join(",");

      await this.conn.query(`
        INSERT INTO automatic_metrics_raw VALUES ${values};
      `);
    }
  }

  async query(sql) {
    const result = await this.conn.query(sql);

    return result.toArray().map((row) => normalizeRow(row.toJSON()));
  }
}

/**
 * Extrai família do modelo e temperatura a partir de chaves como:
 *
 * gpt4o_temp03
 * command_r_plus_08_2024_temp05
 * gemma_27b_temp07
 */
function parseModelKey(modelKey) {
  const match = modelKey.match(/_temp(\d+)$/);

  if (!match) {
    return {
      family: modelKey,
      display: prettifyModelName(modelKey),
      temperature: null,
      temperatureLabel: "—",
    };
  }

  const tempDigits = match[1];
  const family = modelKey.slice(0, match.index);

  /**
   * No arquivo, temperaturas aparecem como temp03, temp05, temp07.
   * Aqui interpretamos como 0.3, 0.5 e 0.7.
   */
  const temperature = Number.parseInt(tempDigits, 10) / 10;
  const temperatureLabel = Number.isFinite(temperature)
    ? temperature.toFixed(1)
    : "—";

  return {
    family,
    display: `${prettifyModelName(family)} · T=${temperatureLabel}`,
    temperature,
    temperatureLabel,
  };
}

function prettifyModelName(value) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  return Number.isFinite(value) ? String(value) : "NULL";
}

function normalizeRow(obj) {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key,
      typeof value === "bigint" ? Number(value) : value,
    ]),
  );
}