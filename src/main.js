import * as d3 from "d3";
import { DiplomatrixData } from "./diplomatrix";
import { renderScatterPlot } from "./views/scatterPlot";
import { renderMetricHistogram } from "./views/metricHistogram";
import { renderTemperatureHistogram } from "./views/temperatureHistogram";
import { renderTemperatureHeatmap } from "./views/temperatureHeatmap";
import { renderOrderedModels } from "./views/orderedModels";
import { prettifyFamily } from "./views/viewUtils";
import "../index.css";

/**
 * Estado central da aplicação.
 *
 * A main mantém apenas o estado global da interação:
 * - métricas selecionadas nos eixos;
 * - ano selecionado;
 * - áreas de brush criadas no scatter;
 * - limite de pontos exibidos nos rankings;
 * - estado da tecla Shift para permitir seleção múltipla.
 *
 * As views recebem esse estado como parâmetro e redesenham o DOM com D3.
 */
const state = {
  data: null,
  xMetric: null,
  yMetric: null,
  year: "Todos",
  brushAreas: [],
  isShiftDown: false,
  rankLimit: "10",
};

window.addEventListener("keydown", (event) => {
  if (event.key === "Shift") {
    state.isShiftDown = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "Shift") {
    state.isShiftDown = false;
  }
});

window.addEventListener("blur", () => {
  state.isShiftDown = false;
});

window.addEventListener("load", async () => {
  mountLayout();

  setStatus("Carregando com DuckDB...", "loading");

  try {
    const diplomatrix = new DiplomatrixData("data/Diplomatrix.json");
    await diplomatrix.init();

    state.data = await diplomatrix.load();

    initializeControls();
    render();

    setStatus("Pronto.", "ready");
  } catch (error) {
    console.error(error);
    setStatus(`Erro: ${error.message}`, "error");
  }
});

function mountLayout() {
  document.body.innerHTML = `
    <main class="app">
      <section class="left-panel">
        <header class="chart-header">
          <h1>Diplomatrix — Comparação de Métricas Automáticas</h1>

          <h2>
            Comparar
            <select id="xMetricSelect"></select>
            com
            <select id="yMetricSelect"></select>
            em
            <select id="yearSelect"></select>
          </h2>
        </header>

        <div id="modelLegend" class="model-legend"></div>

        <div id="scatter" class="scatter-area"></div>
      </section>

      <aside class="right-panel">
        <h2>Subgráficos da seleção</h2>

        <p class="hint">
          Por padrão, os gráficos abaixo consideram todos os pontos do scatter.
          Arraste uma região no scatter plot para filtrar. Segure
          <strong>Shift</strong> enquanto arrasta para adicionar novas regiões
          sem apagar as anteriores.
        </p>

        <div class="side-control">
          <label for="rankLimitSelect">Mostrar nos rankings:</label>
          <select id="rankLimitSelect">
            <option value="5">5 pontos</option>
            <option value="10" selected>10 pontos</option>
            <option value="all">Todos</option>
          </select>
        </div>

        <div id="sideCharts"></div>
      </aside>
    </main>

    <footer class="page-status-row">
      <div id="status" class="status status-loading">
        Carregando com DuckDB...
      </div>
    </footer>
  `;
}

function initializeControls() {
  const { metrics, years } = state.data;

  state.xMetric = pickDefaultMetric(metrics, [
    "BLEU_score",
    "rouge1",
    "BERTScore_Precision",
  ]);

  state.yMetric = pickDefaultMetric(metrics, [
    "BERTScore_F1",
    "rougeL",
    "CTC_groundness",
  ]);

  fillSelect("#xMetricSelect", metrics, state.xMetric);
  fillSelect("#yMetricSelect", metrics, state.yMetric);
  fillSelect("#yearSelect", years, state.year);

  d3.select("#xMetricSelect").on("change", (event) => {
    state.xMetric = event.target.value;
    state.brushAreas = [];
    render();
  });

  d3.select("#yMetricSelect").on("change", (event) => {
    state.yMetric = event.target.value;
    state.brushAreas = [];
    render();
  });

  d3.select("#yearSelect").on("change", (event) => {
    state.year = event.target.value;
    state.brushAreas = [];
    render();
  });

  d3.select("#rankLimitSelect").on("change", (event) => {
    state.rankLimit = event.target.value;
    render();
  });
}

function fillSelect(selector, values, selectedValue) {
  d3.select(selector)
    .selectAll("option")
    .data(values)
    .join("option")
    .attr("value", (d) => d)
    .property("selected", (d) => d === selectedValue)
    .text((d) => d);
}

function pickDefaultMetric(metrics, candidates) {
  return candidates.find((metric) => metrics.includes(metric)) ?? metrics[0];
}

/**
 * Hub central de renderização.
 *
 * A main monta a tabela larga usada pelo scatter, cria a escala de cores
 * compartilhada entre as views e delega o desenho para módulos em views/.
 */
function render() {
  const rows = buildScatterRows(
    state.data.summaryRows,
    state.year,
    state.xMetric,
    state.yMetric,
  );

  const color = buildFamilyColorScale(rows);

  renderFamilyLegend(rows, color);

  renderScatterPlot({
    selector: "#scatter",
    rows,
    color,
    xMetric: state.xMetric,
    yMetric: state.yMetric,
    brushAreas: state.brushAreas,
    isShiftDown: () => state.isShiftDown,
    onBrushAreasChange: (newBrushAreas) => {
      state.brushAreas = newBrushAreas;
    },
    onSelectionChange: ({ selected, hasActiveBrush }) => {
      renderSideCharts({
        selected,
        allRows: rows,
        color,
        hasActiveBrush,
      });
    },
  });
}

/**
 * Transforma a tabela agregada longa em uma tabela larga.
 *
 * O DuckDB retorna uma linha por modelo, métrica e ano. Para o scatter,
 * precisamos de uma linha por ponto com dois valores numéricos: x e y.
 */
function buildScatterRows(summaryRows, year, xMetric, yMetric) {
  const filtered = summaryRows.filter((d) => d.year === year);
  const byModel = d3.group(filtered, (d) => d.model_key);

  const rows = [];

  byModel.forEach((items, modelKey) => {
    const xRow = items.find((d) => d.metric === xMetric);
    const yRow = items.find((d) => d.metric === yMetric);

    if (!xRow || !yRow) return;

    const xValue = Number(xRow.mean_value);
    const yValue = Number(yRow.mean_value);

    if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) return;

    rows.push({
      model_key: modelKey,
      model_family: xRow.model_family,
      model_display: xRow.model_display,
      temperature: xRow.temperature,
      temperature_label: xRow.temperature_label,
      year,
      xMetric,
      yMetric,
      x: xValue,
      y: yValue,
      xN: xRow.n,
      yN: yRow.n,
      xStd: Number(xRow.std_value),
      yStd: Number(yRow.std_value),
    });
  });

  return rows.sort((a, b) => d3.ascending(a.model_display, b.model_display));
}

/**
 * A cor representa família de modelo, não temperatura.
 *
 * Assim, todas as variantes de uma mesma família compartilham a cor,
 * e a temperatura aparece como posição, tooltip e heatmap.
 */
function buildFamilyColorScale(rows) {
  const families = [...new Set(rows.map((d) => d.model_family))].sort();

  const palette =
    families.length <= 10
      ? d3.schemeTableau10
      : d3.quantize(d3.interpolateTurbo, families.length);

  return d3.scaleOrdinal().domain(families).range(palette);
}

function renderFamilyLegend(rows, color) {
  const legend = d3.select("#modelLegend");

  const families = [...new Set(rows.map((d) => d.model_family))]
    .sort()
    .map((family) => ({
      key: family,
      label: prettifyFamily(family),
      color: color(family),
    }));

  legend
    .selectAll("div.legend-item")
    .data(families, (d) => d.key)
    .join("div")
    .attr("class", "legend-item")
    .html(
      (d) => `
        <span class="legend-dot" style="background:${d.color};"></span>
        <span class="legend-label">${d.label}</span>
      `,
    );
}

/**
 * Renderiza o painel lateral.
 *
 * Quando não há brush ativo, o painel usa todos os pontos do scatter.
 * Quando há brush, o painel usa apenas os pontos selecionados.
 */
function renderSideCharts({ selected, allRows, color, hasActiveBrush }) {
  const container = d3.select("#sideCharts");
  container.html("");

  const activeRows = hasActiveBrush ? selected : allRows;
  const usingDefaultSelection = !hasActiveBrush && allRows.length > 0;

  if (!activeRows.length) {
    container.html(`
      <div class="empty-state">
        ${
          hasActiveBrush
            ? "Nenhum ponto dentro da seleção atual."
            : "Nenhum dado disponível para esta combinação de métricas e ano."
        }
      </div>
    `);
    return;
  }

  container.append("div").attr("class", "selection-count").html(`
    <strong>${activeRows.length}</strong>
    ponto(s) considerados
    ${
      usingDefaultSelection
        ? "<span class='selection-note'>todos os pontos do scatter</span>"
        : "<span class='selection-note'>seleção ativa</span>"
    }
  `);

  renderMetricHistogram({
    container,
    title: `Distribuição de ${state.xMetric}`,
    caption:
      "Histograma dos valores da métrica no eixo X para os pontos considerados.",
    values: activeRows.map((d) => d.x),
    colorValue: "#2563eb",
  });

  renderMetricHistogram({
    container,
    title: `Distribuição de ${state.yMetric}`,
    caption:
      "Histograma dos valores da métrica no eixo Y para os pontos considerados.",
    values: activeRows.map((d) => d.y),
    colorValue: "#16a34a",
  });

  renderTemperatureHistogram({
    container,
    title: "Histograma de temperaturas dos modelos",
    caption:
      "Quantidade de pontos considerados em cada temperatura extraída do nome do modelo.",
    rows: activeRows,
  });

  renderTemperatureHeatmap({
    container,
    title: `Heatmap de temperatura por ${state.xMetric}`,
    caption:
      "Linhas representam famílias de modelos, colunas representam temperaturas e a cor representa o valor da métrica do eixo X.",
    rows: activeRows,
    metricName: state.xMetric,
    valueAccessor: (d) => d.x,
  });

  renderTemperatureHeatmap({
    container,
    title: `Heatmap de temperatura por ${state.yMetric}`,
    caption:
      "Linhas representam famílias de modelos, colunas representam temperaturas e a cor representa o valor da métrica do eixo Y.",
    rows: activeRows,
    metricName: state.yMetric,
    valueAccessor: (d) => d.y,
  });

  renderOrderedModels({
    container,
    title: `Pontos ordenados por ${state.xMetric}`,
    caption:
      "Pontos considerados ordenados do maior para o menor valor na métrica do eixo X.",
    rows: activeRows,
    color,
    metricName: state.xMetric,
    valueAccessor: (d) => d.x,
    rankLimit: state.rankLimit,
  });

  renderOrderedModels({
    container,
    title: `Pontos ordenados por ${state.yMetric}`,
    caption:
      "Pontos considerados ordenados do maior para o menor valor na métrica do eixo Y.",
    rows: activeRows,
    color,
    metricName: state.yMetric,
    valueAccessor: (d) => d.y,
    rankLimit: state.rankLimit,
  });
}

function setStatus(text, stateName = "ready") {
  const status = d3.select("#status");

  if (!status.empty()) {
    status.attr("class", `status status-${stateName}`).text(text);
  }
}