import * as d3 from "d3";
import { DiplomatrixData } from "./diplomatrix";
import { renderScatterPlot } from "./views/scatterPlot";
import { renderMetricHistogram } from "./views/metricHistogram";
import { renderTemperatureHistogram } from "./views/temperatureHistogram";
import { renderTemperatureHeatmap } from "./views/temperatureHeatmap";
import { renderOrderedModels } from "./views/orderedModels";
import { renderEssayInspector } from "./views/essayInspector";
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
  selectedModelKey: null,
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

window.addEventListener("resetModelSelection", () => {
  state.selectedModelKey = null;
  render();
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

          <h2 class="chart-controls">
            Comparar
            <select id="xMetricSelect"></select>
            com
            <select id="yMetricSelect"></select>
            em
            <select id="yearSelect"></select>
          </h2>
        </header>

        <div id="modelLegend" class="model-legend"></div>

        <div id="temperatureLegend" class="temperature-legend-row"></div>

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

      <section id="essayInspector" class="essay-inspector-area"></section>
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
    state.selectedModelKey = null;
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
  const canSelectModel = state.year !== "Todos";

  if (!canSelectModel && state.selectedModelKey !== null) {
    state.selectedModelKey = null;
  }

  const rows = buildScatterRows(
    state.data.summaryRows,
    state.year,
    state.xMetric,
    state.yMetric,
  );

  const color = buildFamilyColorScale(rows);

  renderFamilyLegend(rows, color);
  renderTemperatureLegend("#temperatureLegend");

  renderScatterPlot({
    selector: "#scatter",
    rows,
    color,
    xMetric: state.xMetric,
    yMetric: state.yMetric,
    brushAreas: state.brushAreas,
    selectedModelKey: state.selectedModelKey,
    canSelectModel,
    isShiftDown: () => state.isShiftDown,
    onBrushAreasChange: (newBrushAreas) => {
      state.brushAreas = newBrushAreas;
    },
    onModelSelect: (modelKey) => {
      if (!canSelectModel) return;
      state.selectedModelKey = modelKey;
      render();
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

  renderEssayInspector({
    containerSelector: "#essayInspector",
    selectedModelKey: state.selectedModelKey,
    year: state.year,
    rawData: state.data.rawJson,
    colorScale: color,
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
 * e a temperatura aparece pela forma dos pontos, tooltip e heatmap.
 */
function buildFamilyColorScale(rows) {
  const families = [...new Set(rows.map((d) => d.model_family))]
    .filter(Boolean)
    .sort();

  const highContrastPalette = [
    "#0072B2",
    "#D55E00",
    "#009E73",
    "#CC79A7",
    "#E69F00",
    "#56B4E9",
    "#F0E442",
    "#000000",
    "#7B2CBF",
    "#2A9D8F",
    "#E63946",
    "#457B9D",
    "#8C564B",
    "#6A994E",
    "#FF006E",
    "#3A86FF",
    "#FB5607",
    "#8338EC",
    "#118AB2",
    "#073B4C",
  ];

  /**
   * A escala continua dinâmica: as cores são atribuídas apenas às famílias
   * presentes no scatter atual.
   */
  const palette =
    families.length <= highContrastPalette.length
      ? highContrastPalette.slice(0, families.length)
      : buildDynamicHighContrastPalette(families.length);

  return d3
    .scaleOrdinal()
    .domain(families)
    .range(palette)
    .unknown("#94a3b8");
}

function buildDynamicHighContrastPalette(n) {
  /**
   * Para muitos modelos, geramos cores em HCL, que tende a separar melhor
   * percepção de matiz, luminosidade e intensidade do que RGB puro.
   *
   * O passo de 137.5 graus usa a lógica do ângulo áureo para evitar que cores
   * consecutivas fiquem próximas demais no círculo cromático.
   */
  const goldenAngle = 137.508;

  return d3.range(n).map((i) => {
    const hue = (i * goldenAngle) % 360;

    const chroma = i % 2 === 0 ? 70 : 55;
    const lightness = i % 3 === 0 ? 48 : i % 3 === 1 ? 62 : 38;

    return d3.hcl(hue, chroma, lightness).formatHex();
  });
}

function renderFamilyLegend(rows, color) {
  const legend = d3.select("#modelLegend");

  const families = [...new Set(rows.map((d) => d.model_family))]
    .filter(Boolean)
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
 * Legenda da forma dos pontos.
 *
 * Ela fica logo abaixo da legenda de modelos. A cor é neutra porque a cor já
 * codifica família/modelo. Aqui a única codificação explicada é a forma.
 */
function renderTemperatureLegend(selector) {
  const legend = d3.select(selector);

  const temperatures = [
    {
      key: "0.3",
      label: "T=0.3",
      description: "triângulo para baixo",
    },
    {
      key: "0.5",
      label: "T=0.5",
      description: "quadrado",
    },
    {
      key: "0.7",
      label: "T=0.7",
      description: "triângulo para cima",
    },
  ];

  legend.html("");

  legend
    .append("span")
    .attr("class", "temperature-legend-title")
    .text("Temperatura:");

  const items = legend
    .selectAll("div.temperature-legend-item")
    .data(temperatures, (d) => d.key)
    .join("div")
    .attr("class", "temperature-legend-item")
    .attr("title", (d) => d.description);

  const iconSize = 24;

  const icons = items
    .append("svg")
    .attr("class", "temperature-legend-icon")
    .attr("viewBox", `0 0 ${iconSize} ${iconSize}`)
    .attr("width", iconSize)
    .attr("height", iconSize);

  icons
    .append("path")
    .attr("d", (d) => getTemperatureLegendSymbolPath(d.key, 82))
    .attr("transform", (d) => {
      const rotation = getTemperatureLegendRotation(d.key);
      return `translate(${iconSize / 2}, ${iconSize / 2}) rotate(${rotation})`;
    })
    .attr("fill", "#334155")
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1);

  items.append("span").text((d) => d.label);
}

function getTemperatureLegendSymbolPath(temperature, size) {
  return d3
    .symbol()
    .type(getTemperatureLegendSymbolType(temperature))
    .size(size)();
}

function getTemperatureLegendSymbolType(temperature) {
  const normalized = normalizeTemperatureLabel(temperature);

  if (normalized === "0.3") return d3.symbolTriangle;
  if (normalized === "0.5") return d3.symbolSquare;
  if (normalized === "0.7") return d3.symbolTriangle;

  return d3.symbolCircle;
}

function getTemperatureLegendRotation(temperature) {
  const normalized = normalizeTemperatureLabel(temperature);

  if (normalized === "0.3") return 180;
  return 0;
}

function normalizeTemperatureLabel(value) {
  const numericValue = Number(value);

  if (Number.isFinite(numericValue)) {
    return numericValue.toFixed(1);
  }

  return String(value).trim();
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

  const canSelectModel = state.year !== "Todos";
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
      "Heatmap dos Modelos x Temperaturas. A cor representa o valor médio da métrica do eixo X.",
    rows: activeRows,
    metricName: state.xMetric,
    valueAccessor: (d) => d.x,
  });

  renderTemperatureHeatmap({
    container,
    title: `Heatmap de temperatura por ${state.yMetric}`,
    caption:
      "Heatmap dos *Modelos x Temperaturas. A cor representa o valor médio da métrica do eixo Y.",
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
    selectedModelKey: canSelectModel ? state.selectedModelKey : null,
    onModelSelect: canSelectModel
      ? (modelKey) => {
          state.selectedModelKey = modelKey;
          render();
        }
      : null,
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
    selectedModelKey: canSelectModel ? state.selectedModelKey : null,
    onModelSelect: canSelectModel
      ? (modelKey) => {
          state.selectedModelKey = modelKey;
          render();
        }
      : null,
  });
}

function setStatus(text, stateName = "ready") {
  const status = d3.select("#status");

  if (!status.empty()) {
    status.attr("class", `status status-${stateName}`).text(text);
  }
}
