import { loadDb } from "./config";

/**
 * Camada de acesso e transformação de dados do projeto Diplomatrix.
 *
 * Esta classe é responsável por:
 * - carregar o conjunto de dados original em JSON;
 * - transformar a estrutura hierárquica em formato tabular;
 * - armazenar os dados em DuckDB;
 * - executar agregações estatísticas;
 * - fornecer dados preparados para as visualizações.
 *
 * O arquivo original possui estrutura hierárquica:
 *
 * Models_Essays
 *   └── ano
 *       └── Models
 *           └── modelo
 *               └── Automatic Metrics
 *                   └── métrica
 *                       └── candidato: valor
 *
 * Para facilitar análises e consultas, essa estrutura é convertida
 * para uma tabela longa (long format):
 *
 * ano | modelo | família | temperatura | métrica | referência | valor
 *
 * Esse formato é amplamente utilizado em ferramentas de análise
 * e visualização de dados por simplificar filtros, agregações e
 * comparações entre métricas.
 */
export class DiplomatrixData {
  constructor(jsonUrl = "data/Diplomatrix.json") {
    this.jsonUrl = jsonUrl;
  }

  /**
   * Inicializa a conexão com o DuckDB.
   *
   * O DuckDB funciona como mecanismo analítico local,
   * permitindo executar consultas SQL diretamente
   * no navegador.
   */
  async init() {
    this.db = await loadDb();
    this.conn = await this.db.connect();

    await this.conn.query("SET preserve_insertion_order=false;");
  }

  /**
   * Fluxo principal de carregamento dos dados.
   *
   * Etapas executadas:
   * 1. Carrega o JSON;
   * 2. Converte para formato tabular;
   * 3. Cria tabela no DuckDB;
   * 4. Calcula estatísticas por ano;
   * 5. Calcula estatísticas globais;
   * 6. Retorna estruturas prontas para visualização.
   */
  async load() {
    const response = await fetch(this.jsonUrl);

    if (!response.ok) {
      throw new Error(`Erro ao carregar ${this.jsonUrl}: ${response.status}`);
    }

    const json = await response.json();

    /**
     * Conversão da estrutura hierárquica para
     * linhas tabulares individuais.
     */
    const rows = this.flattenAutomaticMetrics(json);

    await this.createRawTable(rows);

    /**
     * Agregação anual.
     *
     * Para cada combinação de:
     * - ano
     * - modelo
     * - temperatura
     * - métrica
     *
     * são calculadas estatísticas descritivas.
     */
    const yearlySummary = await this.query(`
      SELECT
        year,
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
     * Agregação global.
     *
     * Todos os anos são agrupados em um único conjunto
     * para permitir comparações gerais entre modelos.
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

    /**
     * Estrutura consolidada utilizada pelas visualizações.
     */
    return {
      rawJson: json,
      rawRows: rows,
      summaryRows,

      /**
       * Lista de métricas disponíveis.
       */
      metrics: [...new Set(summaryRows.map((d) => d.metric))].sort(),

      /**
       * Lista de anos disponíveis.
       */
      years: [
        "Todos",
        ...sortYearLabels([...new Set(yearlySummary.map((d) => d.year))]),
      ],

      /**
       * Lista de modelos presentes nos dados.
       */
      models: [...new Set(summaryRows.map((d) => d.model_key))].sort(),
    };
  }

  /**
   * Converte o JSON hierárquico para formato tabular.
   *
   * Cada valor individual associado a uma métrica e
   * referência torna-se uma linha independente.
   *
   * O cálculo de médias e demais estatísticas é realizado
   * posteriormente pelo DuckDB.
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

            /**
             * Ignora valores inválidos.
             */
            if (!Number.isFinite(value)) return;

            output.push({
              year,
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
   * Cria a tabela principal contendo os dados brutos.
   *
   * O formato tabular simplifica consultas SQL,
   * agregações e operações analíticas posteriores.
   */
  async createRawTable(rows) {
    await this.conn.query(`
      CREATE OR REPLACE TABLE automatic_metrics_raw (
        year VARCHAR,
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
     * Inserção em lotes (batch insertion).
     *
     * Essa estratégia reduz o tamanho das queries
     * individuais e melhora a eficiência do carregamento.
     */
    const chunkSize = 1000;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);

      const values = chunk
        .map(
          (r) => `(
            ${sqlString(r.year)},
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

  /**
   * Executa uma consulta SQL e converte os resultados
   * para objetos JavaScript comuns.
   */
  async query(sql) {
    const result = await this.conn.query(sql);

    return result.toArray().map((row) => normalizeRow(row.toJSON()));
  }
}

/**
 * Extrai informações estruturadas a partir da chave do modelo.
 *
 * Exemplos:
 * - gpt4o_temp03
 * - gemma_27b_temp07
 * - command_r_plus_08_2024_temp05
 *
 * O padrão adotado permite identificar:
 * - família do modelo;
 * - temperatura utilizada;
 * - rótulo amigável para exibição.
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
   * Conversão do padrão presente no dataset.
   *
   * temp03 → 0.3
   * temp05 → 0.5
   * temp07 → 0.7
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

/**
 * Converte identificadores internos para formato
 * amigável de apresentação.
 */
function prettifyModelName(value) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Escapa textos para inserção segura em comandos SQL.
 */
function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

/**
 * Converte números para representação SQL.
 */
function sqlNumber(value) {
  return Number.isFinite(value) ? String(value) : "NULL";
}

/**
 * Normaliza linhas retornadas pelo DuckDB.
 *
 * Converte valores BigInt para Number,
 * facilitando seu uso pelas visualizações.
 */
function normalizeRow(obj) {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key,
      typeof value === "bigint" ? Number(value) : value,
    ]),
  );
}

/**
 * Ordena anos de forma consistente para exibição
 * nos controles da interface.
 */
function sortYearLabels(years) {
  return years.sort((a, b) =>
    String(a).localeCompare(String(b), "pt-BR", {
      numeric: true,
    }),
  );
}