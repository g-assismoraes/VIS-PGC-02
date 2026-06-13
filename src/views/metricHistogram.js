import * as d3 from "d3";
import {
  formatMetricValue,
  getTooltip,
  moveTooltip,
  paddedDomain,
} from "./viewUtils";

/**
 * Renderiza um histograma para uma métrica numérica.
 *
 * O componente é reutilizado para exibir a distribuição
 * dos valores das métricas selecionadas nos eixos X e Y
 * do scatter plot principal.
 *
 * Os dados recebidos já chegam filtrados pela camada superior
 * da aplicação (por exemplo, após seleção via brush).
 */
export function renderMetricHistogram({
  container,
  title,
  caption,
  values,
  colorValue,
}) {
  // Cria o card visual que encapsula o histograma.
  const card = container.append("div").attr("class", "side-card");

  card.append("h3").text(title);
  card.append("p").attr("class", "chart-caption").text(caption);

  /**
   * Dimensões internas do gráfico.
   *
   * O histograma utiliza SVG responsivo através de viewBox,
   * permitindo adaptação ao espaço disponível sem perder qualidade.
   */
  const width = 380;
  const height = 190;

  const margin = {
    top: 16,
    right: 18,
    bottom: 44,
    left: 48,
  };

  const svg = card
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%");

  /**
   * Remove valores inválidos (NaN, undefined, Infinity etc.)
   * para evitar problemas durante o cálculo dos bins e escalas.
   */
  const cleanValues = values.filter(Number.isFinite);

  // Não há dados suficientes para renderizar o gráfico.
  if (!cleanValues.length) return;

  /**
   * Escala horizontal.
   *
   * Representa o domínio dos valores da métrica analisada.
   * O paddedDomain adiciona uma pequena margem nas extremidades,
   * evitando que barras encostem nas bordas do gráfico.
   */
  const x = d3
    .scaleLinear()
    .domain(paddedDomain(cleanValues))
    .nice()
    .range([margin.left, width - margin.right]);

  /**
   * Agrupa os valores em intervalos (bins).
   *
   * Cada bin representa uma faixa de valores e armazenará
   * a quantidade de observações pertencentes a ela.
   */
  const bins = d3
    .bin()
    .domain(x.domain())
    .thresholds(8)(cleanValues);

  /**
   * Escala vertical.
   *
   * Representa a frequência (quantidade de pontos)
   * existente em cada intervalo do histograma.
   */
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(bins, (d) => d.length) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  // Tooltip compartilhado utilizado pelos componentes da dashboard.
  const tooltip = getTooltip();

  /**
   * Renderização das barras.
   *
   * Cada bin é transformado em um retângulo cuja:
   * - largura representa a faixa do intervalo;
   * - altura representa a frequência de ocorrências.
   */
  svg
    .append("g")
    .selectAll("rect")
    .data(bins)
    .join("rect")
    .attr("x", (d) => x(d.x0) + 1)
    .attr("y", (d) => y(d.length))
    .attr("width", (d) => Math.max(0, x(d.x1) - x(d.x0) - 2))
    .attr("height", (d) => y(0) - y(d.length))
    .attr("rx", 3)
    .attr("fill", colorValue)
    .attr("opacity", 0.85)

    /**
     * Exibe informações detalhadas do intervalo selecionado.
     */
    .on("mouseover", function (event, d) {
      d3.select(this).attr("opacity", 1);

      tooltip.style("opacity", 1).html(`
        <div class="tooltip-title">Intervalo</div>

        <div class="tooltip-row">
          <span class="tooltip-label">De:</span>
          <span class="tooltip-val">${formatMetricValue(d.x0)}</span>
        </div>

        <div class="tooltip-row">
          <span class="tooltip-label">Até:</span>
          <span class="tooltip-val">${formatMetricValue(d.x1)}</span>
        </div>

        <div class="tooltip-row tooltip-divider">
          <span class="tooltip-label">Pontos:</span>
          <span class="tooltip-val highlight">${d.length}</span>
        </div>
      `);

      moveTooltip(event);
    })

    // Mantém o tooltip acompanhando o cursor.
    .on("mousemove", moveTooltip)

    // Restaura o estado visual ao sair da barra.
    .on("mouseout", function () {
      d3.select(this).attr("opacity", 0.85);
      tooltip.style("opacity", 0);
    });

  /**
   * Eixo X.
   *
   * Representa os valores da métrica analisada.
   */
  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(4))
    .selectAll("text")
    .attr("font-size", 9.5)
    .attr("fill", "#475569");

  /**
   * Eixo Y.
   *
   * Representa a quantidade de observações
   * presentes em cada intervalo.
   */
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(3))
    .selectAll("text")
    .attr("font-size", 9.5)
    .attr("fill", "#475569");
}