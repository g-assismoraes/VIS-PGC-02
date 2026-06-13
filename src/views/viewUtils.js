import * as d3 from "d3";

/**
 * Funções utilitárias compartilhadas por todas as visualizações da aplicação.
 *
 * Este módulo centraliza comportamentos reutilizados por múltiplos gráficos,
 * reduzindo duplicação de código e mantendo cada componente focado apenas
 * em sua própria responsabilidade visual.
 *
 * As funções deste arquivo oferecem suporte para:
 * - formatação de valores;
 * - tratamento e normalização de dados;
 * - ordenação de temperaturas;
 * - seleção por brush;
 * - manipulação de tooltips;
 * - construção de domínios para escalas.
 */

/**
 * Formata valores numéricos para exibição em tooltips,
 * eixos e legendas.
 *
 * Valores menores que 1 recebem maior precisão para facilitar
 * comparações entre métricas de pequena magnitude.
 */
export function formatMetricValue(value) {
  if (!Number.isFinite(value)) return "—";
  return value < 1 ? value.toFixed(4) : value.toFixed(3);
}

/**
 * Converte identificadores internos de famílias de modelos
 * para um formato mais amigável ao usuário.
 *
 * Exemplo:
 * "open_source_models" → "Open Source Models"
 */
export function prettifyFamily(value) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Limita o tamanho de textos exibidos em eixos,
 * rankings e rótulos.
 *
 * Evita sobreposição visual quando o espaço disponível
 * é reduzido.
 */
export function truncate(value, maxLength) {
  const text = String(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 * Calcula um domínio numérico com margem adicional.
 *
 * Essa margem impede que pontos ou barras fiquem
 * encostados nas bordas do gráfico.
 */
export function paddedDomain(values) {
  const cleanValues = values.filter(Number.isFinite);
  let [min, max] = d3.extent(cleanValues);

  if (min === undefined || max === undefined) {
    return [0, 1];
  }

  /**
   * Quando todos os valores são iguais,
   * cria-se um pequeno intervalo artificial para
   * permitir a construção adequada da escala.
   */
  if (min === max) {
    const delta = Math.abs(min) * 0.05 || 0.001;
    return [min - delta, max + delta];
  }

  const padding = (max - min) * 0.08;

  return [min - padding, max + padding];
}

/**
 * Ordena temperaturas respeitando seu valor numérico.
 *
 * Evita ordenações lexicográficas incorretas como:
 * 0.10, 0.3, 0.5
 *
 * produzindo:
 * 0.3, 0.5, 0.10
 */
export function compareTemperatureLabels(a, b) {
  const numericA = Number(a);
  const numericB = Number(b);

  if (Number.isFinite(numericA) && Number.isFinite(numericB)) {
    return d3.ascending(numericA, numericB);
  }

  return d3.ascending(String(a), String(b));
}

/**
 * Adaptador utilizado quando a temperatura está
 * armazenada dentro de objetos.
 */
export function compareTemperatureObjects(a, b) {
  return compareTemperatureLabels(a.temperature, b.temperature);
}

/**
 * Normaliza as coordenadas produzidas pelo brush do D3.
 *
 * Como o usuário pode arrastar em qualquer direção,
 * garante que x0/y0 representem sempre o canto superior
 * esquerdo e x1/y1 o canto inferior direito.
 */
export function normalizeBrushSelection(selection) {
  const [[x0, y0], [x1, y1]] = selection;

  return {
    x0: Math.min(x0, x1),
    y0: Math.min(y0, y1),
    x1: Math.max(x0, x1),
    y1: Math.max(y0, y1),
  };
}

/**
 * Verifica se uma região selecionada é pequena demais
 * para ser considerada um brush válido.
 *
 * Isso evita ativações acidentais decorrentes de cliques
 * ou movimentos mínimos do mouse.
 */
export function isTinyArea(area) {
  return area.x1 - area.x0 < 4 || area.y1 - area.y0 < 4;
}

/**
 * Determina quais registros estão contidos dentro de uma
 * ou mais áreas de seleção.
 *
 * Os valores dos dados são convertidos para coordenadas
 * de tela através das escalas atuais do gráfico.
 */
export function getRowsInsideBrushAreas(rows, brushAreas, xScale, yScale) {
  if (!brushAreas.length) return [];

  return rows.filter((d) => {
    const px = xScale(d.x);
    const py = yScale(d.y);

    return brushAreas.some(
      (area) =>
        px >= area.x0 &&
        px <= area.x1 &&
        py >= area.y0 &&
        py <= area.y1,
    );
  });
}

/**
 * Obtém a instância única de tooltip utilizada por toda
 * a aplicação.
 *
 * O uso de join garante que apenas um elemento tooltip
 * exista no DOM independentemente da quantidade de gráficos.
 */
export function getTooltip() {
  return d3
    .select("body")
    .selectAll(".chart-tooltip")
    .data([null])
    .join("div")
    .attr("class", "chart-tooltip");
}

/**
 * Atualiza a posição do tooltip acompanhando o cursor.
 *
 * O posicionamento considera os limites da janela para
 * impedir que o tooltip fique parcialmente oculto fora
 * da área visível da aplicação.
 */
export function moveTooltip(event) {
  const tooltip = getTooltip();

  const node = tooltip.node();
  const tooltipWidth = node?.offsetWidth || 260;
  const tooltipHeight = node?.offsetHeight || 120;

  const margin = 12;

  const viewportLeft = window.scrollX;
  const viewportTop = window.scrollY;
  const viewportRight = window.scrollX + window.innerWidth;
  const viewportBottom = window.scrollY + window.innerHeight;

  /**
   * Posição inicial ao lado do cursor.
   */
  let left = event.pageX + 16;
  let top = event.pageY - 28;

  /**
   * Ajustes para manter o tooltip dentro da área visível:
   * - borda direita;
   * - borda esquerda;
   * - borda inferior;
   * - borda superior.
   */
  if (left + tooltipWidth + margin > viewportRight) {
    left = event.pageX - tooltipWidth - 16;
  }

  if (left < viewportLeft + margin) {
    left = viewportLeft + margin;
  }

  if (top + tooltipHeight + margin > viewportBottom) {
    top = viewportBottom - tooltipHeight - margin;
  }

  if (top < viewportTop + margin) {
    top = viewportTop + margin;
  }

  tooltip.style("left", `${left}px`).style("top", `${top}px`);
}