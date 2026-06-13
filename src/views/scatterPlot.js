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
 * Scatter Plot Principal da aplicação.
 *
 * Este componente é responsável pela visualização central da dashboard,
 * permitindo explorar relações entre duas métricas quantitativas
 * selecionadas pelo usuário.
 *
 * Responsabilidades:
 * - Exibir modelos em um plano cartesiano;
 * - Permitir seleção visual por brushing;
 * - Permitir seleção individual de modelos;
 * - Comunicar alterações de seleção para a camada principal;
 * - Coordenar a atualização dos componentes auxiliares.
 *
 * A gestão global de estado permanece em main.js,
 * enquanto este módulo concentra apenas lógica visual e interativa.
 *
 * Codificações visuais:
 * - Eixo X → métrica selecionada para análise horizontal;
 * - Eixo Y → métrica selecionada para análise vertical;
 * - Cor → família do modelo;
 * - Forma → temperatura utilizada na geração.
 */
export function renderScatterPlot({
  selector,
  rows,
  color,
  xMetric,
  yMetric,
  brushAreas,
  selectedModelKey = null,
  canSelectModel = true,
  isShiftDown,
  onBrushAreasChange,
  onModelSelect = () => {},
  onSelectionChange,
}) {
  const container = d3.select(selector);
  container.html("");

  /**
   * Configuração dimensional do gráfico.
   *
   * O SVG utiliza viewBox para manter comportamento responsivo
   * sem perda de qualidade.
   */
  const width = 960;
  const height = 720;

  const margin = {
    top: 42,
    right: 34,
    bottom: 84,
    left: 92,
  };

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

  /**
   * Caso não existam dados válidos para a combinação atual de filtros,
   * exibe uma mensagem amigável e notifica a aplicação de que não há
   * seleção ativa.
   */
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
   * O domínio recebe uma pequena margem adicional através de paddedDomain
   * para evitar que pontos fiquem encostados nas bordas da área útil.
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

  /**
   * Grade auxiliar.
   *
   * Facilita a leitura visual dos valores sem competir com os elementos
   * principais do gráfico.
   */
  g.append("g")
    .attr("class", "grid")
    .call(
      d3
        .axisLeft(y)
        .ticks(7)
        .tickSize(-plotWidth)
        .tickFormat(""),
    )
    .selectAll("line")
    .attr("stroke", "#e2e8f0")
    .attr("stroke-dasharray", "3,3");

  g.select(".grid .domain").remove();

  /**
   * Eixo X.
   */
  const xAxisG = g
    .append("g")
    .attr("transform", `translate(0,${plotHeight})`)
    .call(d3.axisBottom(x).ticks(7));

  xAxisG
    .selectAll("text")
    .attr("font-size", 12)
    .attr("fill", "#475569");

  xAxisG.selectAll("line").attr("stroke", "#cbd5e1");
  xAxisG.select(".domain").attr("stroke", "#cbd5e1");

  /**
   * Eixo Y.
   */
  const yAxisG = g.append("g").call(d3.axisLeft(y).ticks(7));

  yAxisG
    .selectAll("text")
    .attr("font-size", 12)
    .attr("fill", "#475569");

  yAxisG.selectAll("line").attr("stroke", "#cbd5e1");
  yAxisG.select(".domain").attr("stroke", "#cbd5e1");

  /**
   * Rótulo do eixo X.
   */
  g.append("text")
    .attr("x", plotWidth / 2)
    .attr("y", plotHeight + 60)
    .attr("text-anchor", "middle")
    .attr("fill", "#0f172a")
    .attr("font-size", 14)
    .attr("font-weight", 800)
    .text(xMetric);

  /**
   * Rótulo do eixo Y.
   */
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

  /**
   * Camada responsável por desenhar as regiões persistentes de seleção.
   *
   * Os retângulos daqui são os tracejados que ficam visíveis depois que o
   * usuário solta o mouse. Eles são separados da camada interna do brush do D3,
   * que só mostra o retângulo temporário durante o arraste.
   */
  const selectionLayer = g
    .append("g")
    .attr("class", "selection-layer");

  let points;
  let currentBrushAreas = [...brushAreas];

  /**
   * Atualiza toda a representação visual relacionada à seleção corrente.
   *
   * Responsabilidades:
   * - Atualizar regiões tracejadas selecionadas;
   * - Destacar pontos contidos nas regiões;
   * - Destacar modelo explicitamente selecionado;
   * - Informar a camada principal sobre alterações.
   */
  function updateSelections() {
    const selected = getRowsInsideBrushAreas(
      rows,
      currentBrushAreas,
      x,
      y,
    );

    const selectedSet = new Set(
      selected.map((d) => d.model_key),
    );

    const hasActiveBrush = currentBrushAreas.length > 0;

    selectionLayer
      .selectAll("rect.selection-area")
      .data(currentBrushAreas)
      .join("rect")
      .attr("class", "selection-area")
      .attr("x", (d) => d.x0)
      .attr("y", (d) => d.y0)
      .attr("width", (d) => d.x1 - d.x0)
      .attr("height", (d) => d.y1 - d.y0)
      .attr("fill", "rgba(37, 99, 235, 0.08)")
      .attr("stroke", "#2563eb")
      .attr("stroke-width", 1.6)
      .attr("stroke-dasharray", "5,4");

    if (points) {
      points
        /**
         * Hierarquia visual:
         * 1. Modelo selecionado individualmente;
         * 2. Modelos dentro do brush;
         * 3. Demais modelos.
         */
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
        /**
         * Aumenta o tamanho do símbolo para o modelo atualmente selecionado.
         */
        .attr("d", (d) => {
          if (d.model_key === selectedModelKey) {
            return getTemperatureSymbolPath(d, 220);
          }

          return getTemperatureSymbolPath(d, 105);
        });
    }

    onSelectionChange({
      selected,
      hasActiveBrush,
    });
  }

  /**
   * Camada responsável pelo brush.
   *
   * Ela fica antes dos pontos no SVG. Assim, os pontos continuam recebendo
   * eventos de tooltip e clique, mas o brush segue funcionando em áreas livres
   * do scatter.
   */
  const brushLayer = g.append("g").attr("class", "brush");

  let brushShiftMode = false;

  /**
   * Brush com suporte a múltiplas regiões.
   *
   * Comportamento:
   * - Sem Shift → substitui seleção existente;
   * - Com Shift → adiciona nova região.
   *
   * Essa lógica estava faltando no arquivo anterior. Sem ela, o D3 até podia
   * mostrar o retângulo temporário durante o arraste, mas nenhuma área era
   * salva em currentBrushAreas, então os tracejados persistentes sumiam.
   */
  const brush = d3
    .brush()
    .keyModifiers(false)
    .extent([
      [0, 0],
      [plotWidth, plotHeight],
    ])
    .on("start", (event) => {
      brushShiftMode =
        isShiftDown() ||
        Boolean(event.sourceEvent?.shiftKey);
    })
    .on("end", (event) => {
      if (!event.sourceEvent) return;

      const selection = event.selection;

      const shiftPressed =
        brushShiftMode ||
        isShiftDown() ||
        Boolean(event.sourceEvent?.shiftKey);

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

      /**
       * Limpa o retângulo temporário do D3.
       *
       * As regiões que devem permanecer visíveis são desenhadas por
       * selectionLayer como rect.selection-area.
       */
      brushLayer.call(brush.move, null);

      updateSelections();
      brushShiftMode = false;
    });

  brushLayer.call(brush);

  /**
   * Garante que a seleção temporária do D3 também apareça tracejada.
   *
   * O CSS já pode fazer isso, mas deixar aqui também torna a view mais robusta
   * caso algum estilo externo sobrescreva a classe .brush .selection.
   */
  brushLayer
    .selectAll(".selection")
    .attr("fill", "rgba(37, 99, 235, 0.12)")
    .attr("stroke", "#2563eb")
    .attr("stroke-dasharray", "4,3");

  /**
   * Renderização dos pontos.
   *
   * Foi escolhido path + d3.symbol em vez de círculos para permitir a
   * codificação da temperatura através da forma geométrica.
   *
   * Dessa forma:
   * - Cor representa família;
   * - Forma representa temperatura.
   *
   * Evita sobreposição semântica entre canais visuais.
   */
  points = g
    .append("g")
    .attr("class", "points")
    .selectAll("path")
    .data(rows)
    .join("path")
    .attr("d", (d) => getTemperatureSymbolPath(d, 105))
    .attr("transform", (d) =>
      getTemperatureSymbolTransform(d, x, y),
    )
    .attr("fill", (d) => color(d.model_family))
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1.5)
    .attr("opacity", 0.9)
    .style("cursor", canSelectModel ? "pointer" : "default")
    /**
     * Exibe informações completas do modelo.
     */
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
    /**
     * Restaura o tamanho original do símbolo quando o cursor sai.
     *
     * Caso o modelo esteja selecionado individualmente, ele volta para o
     * tamanho maior definido em updateSelections.
     */
    .on("mouseout", function (event, d) {
      const size = d.model_key === selectedModelKey ? 220 : 105;

      d3.select(this).attr("d", getTemperatureSymbolPath(d, size));

      tooltip.style("opacity", 0);
    })
    /**
     * Seleção individual de modelo.
     *
     * Permite sincronização futura com ranking, painel de inspeção ou outras
     * visualizações coordenadas. Caso a main não use isso, onModelSelect é uma
     * função vazia por padrão.
     */
    .on("click", function (event, d) {
      if (!canSelectModel) return;

      event.stopPropagation();

      const isCurrentSelected = d.model_key === selectedModelKey;

      onModelSelect(isCurrentSelected ? null : d.model_key);
    });

  updateSelections();
}

/**
 * Determina o símbolo utilizado para representar a temperatura de geração.
 *
 * Estratégia visual:
 * T=0.3 → triângulo invertido
 * T=0.5 → quadrado
 * T=0.7 → triângulo normal
 */
function getTemperatureSymbolType(d) {
  const temperature =
    normalizeTemperatureLabel(d.temperature_label);

  if (temperature === "0.3") return d3.symbolTriangle;
  if (temperature === "0.5") return d3.symbolSquare;
  if (temperature === "0.7") return d3.symbolTriangle;

  return d3.symbolCircle;
}

/**
 * Define rotações necessárias para diferenciar visualmente temperaturas que
 * utilizam o mesmo tipo básico de símbolo.
 */
function getTemperatureRotation(temperatureLabel) {
  const temperature =
    normalizeTemperatureLabel(temperatureLabel);

  if (temperature === "0.3") return 180;

  return 0;
}

/**
 * Gera o path SVG correspondente ao símbolo.
 */
function getTemperatureSymbolPath(d, size) {
  return d3
    .symbol()
    .type(getTemperatureSymbolType(d))
    .size(size)();
}

/**
 * Posiciona e orienta o símbolo dentro do sistema de coordenadas do scatter.
 */
function getTemperatureSymbolTransform(d, xScale, yScale) {
  const rotation = getTemperatureRotation(d.temperature_label);

  return `translate(${xScale(d.x)},${yScale(d.y)}) rotate(${rotation})`;
}

/**
 * Normaliza rótulos de temperatura para evitar inconsistências de formatação.
 */
function normalizeTemperatureLabel(value) {
  const numericValue = Number(value);

  if (Number.isFinite(numericValue)) {
    return numericValue.toFixed(1);
  }

  return String(value).trim();
}