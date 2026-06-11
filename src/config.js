import * as duckdb from "@duckdb/duckdb-wasm";

let dbPromise = null;

/**
 * Inicializa uma instância única do DuckDB WASM.
 *
 * A aplicação usa DuckDB para organizar e agregar os dados depois que o JSON
 * é transformado em uma tabela longa de métricas.
 */
export async function loadDb() {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const bundles = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(bundles);

    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], {
        type: "text/javascript",
      }),
    );

    const worker = new Worker(workerUrl);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);

    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    URL.revokeObjectURL(workerUrl);

    return db;
  })();

  return dbPromise;
}