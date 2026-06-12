import * as d3 from "d3";
import {
  formatMetricValue,
  getRowsInsideBrushAreas,
  getTooltip,
  isTinyArea,
  moveTooltip,
  normalizeBrushSelection,
  paddedDomain,
  prettifyFamily,
} from "./viewUtils";

/**
 * Scatter plot principal.
 *
 * Esta view recebe o estado necessário como parâmetros e devolve alterações
 * de seleção para a main por callbacks. Assim, o gerenciamento global de estado
 * fica centralizado em main.js, enquanto este arquivo cuida apenas da lógica
 * visual e interativa do scatter.
 *
 * Codificações visuais:
 * - posição X: métrica selecionada para o eixo X;
 * - posição Y: métrica selecionada para o eixo Y;
 * - cor: família/modelo;
 * - forma: temperatura.
 */
export function renderScatterPlot({
  selector,
  rows,
  color,
  xMetric,
  yMetric,
  brushAreas,
  selectedModelKey,
  isShiftDown,
  onBrushAreasChange,
  onModelSelect,
  onSelectionChange,
}) {
  const container = d3.select(selector);
  container.html("");

  const width = 960;
  const height = 720;
  const margin = { top: 42, right: 34, bottom: 84, left: 92 };

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%")
    .attr("height", "100%");

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  if (!rows.length) {
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#64748b")
      .attr("font-size", 16)
      .text("Não há dados para essa combinação de métricas e ano.");

    onSelectionChange({
      selected: [],
      hasActiveBrush: false,
    });

    return;
  }

  /**
   * Escalas quantitativas.
   *
   * O domínio recebe uma pequena margem com paddedDomain para evitar pontos
   * colados nas bordas do gráfico.
   */
  const x = d3
    .scaleLinear()
    .domain(paddedDomain(rows.map((d) => d.x)))
    .nice()
    .range([0, plotWidth]);

  const y = d3
    .scaleLinear()
    .domain(paddedDomain(rows.map((d) => d.y)))
    .nice()
    .range([plotHeight, 0]);

  g.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(y).ticks(7).tickSize(-plotWidth).tickFormat(""))
    .selectAll("line")
    .attr("stroke", "#e2e8f0")
    .attr("stroke-dasharray", "3,3");

  g.select(".grid .domain").remove();

  const xAxisG = g
    .append("g")
    .attr("transform", `translate(0,${plotHeight})`)
    .call(d3.axisBottom(x).ticks(7));

  xAxisG.selectAll("text").attr("font-size", 12).attr("fill", "#475569");
  xAxisG.selectAll("line").attr("stroke", "#cbd5e1");
  xAxisG.select(".domain").attr("stroke", "#cbd5e1");

  const yAxisG = g.append("g").call(d3.axisLeft(y).ticks(7));

  yAxisG.selectAll("text").attr("font-size", 12).attr("fill", "#475569");
  yAxisG.selectAll("line").attr("stroke", "#cbd5e1");
  yAxisG.select(".domain").attr("stroke", "#cbd5e1");

  g.append("text")
    .attr("x", plotWidth / 2)
    .attr("y", plotHeight + 60)
    .attr("text-anchor", "middle")
    .attr("fill", "#0f172a")
    .attr("font-size", 14)
    .attr("font-weight", 800)
    .text(xMetric);

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -plotHeight / 2)
    .attr("y", -66)
    .attr("text-anchor", "middle")
    .attr("fill", "#0f172a")
    .attr("font-size", 14)
    .attr("font-weight", 800)
    .text(yMetric);

  const tooltip = getTooltip();

  const selectionLayer = g.append("g").attr("class", "selection-layer");
  let points;
  let currentBrushAreas = [...brushAreas];

  /**
   * Atualização do DOM a partir do estado de seleção.
   *
   * O D3 atualiza os retângulos de seleção com join e também altera opacidade
   * e contorno dos pontos. A main é notificada para atualizar os subgráficos.
   */
  function updateSelections() {
    const selected = getRowsInsideBrushAreas(rows, currentBrushAreas, x, y);
    const selectedSet = new Set(selected.map((d) => d.model_key));
    const hasActiveBrush = currentBrushAreas.length > 0;

    selectionLayer
      .selectAll("rect.selection-area")
      .data(currentBrushAreas)
      .join("rect")
      .attr("class", "selection-area")
      .attr("x", (d) => d.x0)
      .attr("y", (d) => d.y0)
      .attr("width", (d) => d.x1 - d.x0)
      .attr("height", (d) => d.y1 - d.y0);

    if (points) {
      points
        .attr("stroke", (d) => {
          if (d.model_key === selectedModelKey) return "#ff007f";
          if (selectedSet.has(d.model_key)) return "#0f172a";
          return "#ffffff";
        })
        .attr("stroke-width", (d) => {
          if (d.model_key === selectedModelKey) return 4.0;
          if (selectedSet.has(d.model_key)) return 2.8;
          return 1.5;
        })
        .attr("opacity", (d) => {
          if (!hasActiveBrush) return 0.9;
          return selectedSet.has(d.model_key) ? 1 : 0.28;
        })
        .attr("d", (d) => {
          if (d.model_key === selectedModelKey) return getTemperatureSymbolPath(d, 220);
          return getTemperatureSymbolPath(d, 105);
        });
    }

    onSelectionChange({
      selected,
      hasActiveBrush,
    });
  }

  const brushLayer = g.append("g").attr("class", "brush");

  let brushShiftMode = false;

  /**
   * Brush com múltiplas regiões.
   *
   * Arrastar sem Shift substitui a seleção anterior.
   * Arrastar com Shift adiciona uma nova região. O keyModifiers(false)
   * impede que o D3 use Shift para comportamento interno e permite controlar
   * esse estado manualmente.
   */
  const brush = d3
    .brush()
    .keyModifiers(false)
    .extent([
      [0, 0],
      [plotWidth, plotHeight],
    ])
    .on("start", (event) => {
      brushShiftMode = isShiftDown() || Boolean(event.sourceEvent?.shiftKey);
    })
    .on("end", (event) => {
      if (!event.sourceEvent) return;

      const selection = event.selection;
      const shiftPressed =
        brushShiftMode || isShiftDown() || Boolean(event.sourceEvent?.shiftKey);

      if (!selection) {
        if (!shiftPressed) {
          currentBrushAreas = [];
          onBrushAreasChange(currentBrushAreas);
          updateSelections();
        }

        brushShiftMode = false;
        return;
      }

      const area = normalizeBrushSelection(selection);

      if (isTinyArea(area)) {
        if (!shiftPressed) {
          currentBrushAreas = [];
          onBrushAreasChange(currentBrushAreas);
          updateSelections();
        }

        brushLayer.call(brush.move, null);
        brushShiftMode = false;
        return;
      }

      if (shiftPressed) {
        currentBrushAreas = [...currentBrushAreas, area];
      } else {
        currentBrushAreas = [area];
      }

      onBrushAreasChange(currentBrushAreas);

      brushLayer.call(brush.move, null);
      updateSelections();
      brushShiftMode = false;
    });

  brushLayer.call(brush);

  /**
   * Pontos do scatter.
   *
   * Usamos path + d3.symbol em vez de circle. Isso permite codificar
   * temperatura pela forma, mantendo a cor exclusivamente para família/modelo.
   */
  points = g
    .append("g")
    .attr("class", "points")
    .selectAll("path")
    .data(rows)
    .join("path")
    .attr("d", (d) => getTemperatureSymbolPath(d, 105))
    .attr("transform", (d) => getTemperatureSymbolTransform(d, x, y))
    .attr("fill", (d) => color(d.model_family))
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1.5)
    .attr("opacity", 0.9)
    .on("mouseover", function (event, d) {
      d3.select(this)
        .attr("d", getTemperatureSymbolPath(d, 165))
        .attr("opacity", 1);

      tooltip.style("opacity", 1).html(`
        <div class="tooltip-title">${d.model_key}</div>

        <div class="tooltip-row">
          <span class="tooltip-label">Família:</span>
          <span class="tooltip-val">${prettifyFamily(d.model_family)}</span>
        </div>

        <div class="tooltip-row">
          <span class="tooltip-label">Temperatura:</span>
          <span class="tooltip-val">${d.temperature_label}</span>
        </div>

        <div class="tooltip-row">
          <span class="tooltip-label">Ano:</span>
          <span class="tooltip-val">${d.year}</span>
        </div>

        <div class="tooltip-row tooltip-divider">
          <span class="tooltip-label">${d.xMetric}:</span>
          <span class="tooltip-val highlight">${formatMetricValue(d.x)}</span>
        </div>

        <div class="tooltip-row">
          <span class="tooltip-label">${d.yMetric}:</span>
          <span class="tooltip-val highlight">${formatMetricValue(d.y)}</span>
        </div>
      `);

      moveTooltip(event);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function (event, d) {
      d3.select(this).attr("d", getTemperatureSymbolPath(d, 105));
      tooltip.style("opacity", 0);
    })
    .on("click", function (event, d) {
      event.stopPropagation();
      const isCurrentSelected = d.model_key === selectedModelKey;
      onModelSelect(isCurrentSelected ? null : d.model_key);
    });

  updateSelections();
}

/**
 * Define a forma de cada temperatura.
 *
 * T=0.3 e T=0.7 usam triângulo. A diferença visual vem da rotação:
 * - 0.3 aponta para baixo;
 * - 0.7 aponta para cima.
 *
 * T=0.5 usa quadrado.
 */
function getTemperatureSymbolType(d) {
  const temperature = normalizeTemperatureLabel(d.temperature_label);

  if (temperature === "0.3") return d3.symbolTriangle;
  if (temperature === "0.5") return d3.symbolSquare;
  if (temperature === "0.7") return d3.symbolTriangle;

  return d3.symbolCircle;
}

function getTemperatureRotation(temperatureLabel) {
  const temperature = normalizeTemperatureLabel(temperatureLabel);

  if (temperature === "0.3") return 180;
  return 0;
}

function getTemperatureSymbolPath(d, size) {
  return d3.symbol().type(getTemperatureSymbolType(d)).size(size)();
}

function getTemperatureSymbolTransform(d, xScale, yScale) {
  const rotation = getTemperatureRotation(d.temperature_label);

  return `translate(${xScale(d.x)},${yScale(d.y)}) rotate(${rotation})`;
}

/**
 * Normaliza rótulos para evitar diferenças como "0.30", "0.3" ou número 0.3.
 */
function normalizeTemperatureLabel(value) {
  const numericValue = Number(value);

  if (Number.isFinite(numericValue)) {
    return numericValue.toFixed(1);
  }

  return String(value).trim();
}