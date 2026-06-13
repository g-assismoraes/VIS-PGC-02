import * as duckdb from "@duckdb/duckdb-wasm";

let dbPromise = null;

/**
 * Inicializa e disponibiliza uma instância única do DuckDB WASM.
 *
 * O DuckDB é utilizado como mecanismo analítico local da aplicação,
 * permitindo consultas SQL, agregações e transformações diretamente
 * no navegador sem necessidade de um servidor dedicado.
 *
 * O padrão Singleton é utilizado para garantir que apenas uma instância
 * do banco seja criada durante todo o ciclo de vida da aplicação,
 * reduzindo consumo de memória e tempo de inicialização.
 */
export async function loadDb() {
  /**
   * Caso o banco já tenha sido inicializado anteriormente,
   * reutiliza a mesma Promise.
   */
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    /**
     * Obtém os bundles disponíveis do DuckDB WASM.
     *
     * Cada bundle contém os arquivos necessários para execução
     * do banco de dados em diferentes ambientes e navegadores.
     */
    const bundles = duckdb.getJsDelivrBundles();

    /**
     * Seleciona automaticamente o bundle mais adequado
     * para o ambiente atual.
     */
    const bundle = await duckdb.selectBundle(bundles);

    /**
     * Cria dinamicamente um Web Worker responsável pela execução
     * do DuckDB em uma thread separada.
     *
     * Isso evita bloqueios da interface durante consultas e
     * operações analíticas mais custosas.
     */
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], {
        type: "text/javascript",
      }),
    );

    const worker = new Worker(workerUrl);

    /**
     * Logger utilizado para depuração e monitoramento
     * das operações internas do DuckDB.
     */
    const logger = new duckdb.ConsoleLogger();

    /**
     * Cria a instância assíncrona do DuckDB associada ao Worker.
     */
    const db = new duckdb.AsyncDuckDB(logger, worker);

    /**
     * Inicializa o mecanismo DuckDB carregando os módulos WASM
     * necessários para execução do banco.
     */
    await db.instantiate(
      bundle.mainModule,
      bundle.pthreadWorker,
    );

    /**
     * Libera a URL temporária criada para o Worker,
     * evitando consumo desnecessário de recursos.
     */
    URL.revokeObjectURL(workerUrl);

    return db;
  })();

  return dbPromise;
}