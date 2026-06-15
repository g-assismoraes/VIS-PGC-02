# DiplomatrixVis

## Estrutura

```txt
projeto/
├── index.html
├── index.css
├── package.json
├── data/
│   └── Diplomatrix.json
└── src/
    ├── main.js
    ├── diplomatrix.js
    └── views/
        ├── scatterPlot.js
        ├── metricHistogram.js
        ├── temperatureHistogram.js
        ├── temperatureHeatmap.js
        ├── orderedModels.js
        ├── essayInspector.js
        └── viewUtils.js
```

## Instalação

```bash
npm install
```

## Execução

```bash
npm run dev
```

## Dados

```txt
data/
└── Diplomatrix.json
```

## Entrada esperada

```txt
Models_Essays
└── ano
    └── Models
        └── modelo
            ├── Essay
            ├── Linguistic Metrics
            └── Automatic Metrics
                └── métrica
                    └── candidato: valor
```

```txt
Candidates_Essays
└── ano
    ├── Question_Statement
    └── Candidates
        └── candidato
            ├── Name
            ├── Score
            ├── Essay
            └── Linguistic_Metrics
```

## Arquivos principais

```txt
src/main.js
```

- Monta a interface.
- Controla o estado global.
- Gerencia filtros, seleções e interações.
- Atualiza as visualizações coordenadas.

```txt
src/diplomatrix.js
```

- Carrega o JSON.
- Inicializa o DuckDB WASM.
- Converte os dados para formato tabular.
- Agrega métricas por ano, modelo, família e temperatura.

```txt
src/views/scatterPlot.js
```

- Renderiza o scatter plot principal.
- Codifica métricas nos eixos X e Y.
- Usa cor para família de modelo.
- Usa forma para temperatura.
- Implementa tooltip, brush e seleção de modelo.

```txt
src/views/metricHistogram.js
```

- Renderiza histogramas das métricas selecionadas.

```txt
src/views/orderedModels.js
```

- Renderiza rankings de modelos por métrica.

```txt
src/views/temperatureHistogram.js
```

- Renderiza histograma das temperaturas.

```txt
src/views/temperatureHeatmap.js
```

- Renderiza heatmaps de família de modelo por temperatura.

```txt
src/views/essayInspector.js
```

- Exibe redação gerada.
- Exibe referência humana.
- Compara métricas automáticas.
- Compara indicadores linguísticos.

```txt
src/views/viewUtils.js
```

- Contém funções auxiliares compartilhadas.
- Gerencia tooltip e utilidades visuais.

## Interações

```txt
Selecionar métrica X
Selecionar métrica Y
Filtrar por ano
Selecionar pontos com brush
Acumular regiões com Shift + brush
Clicar em modelo
Atualizar linked views
Inspecionar redações
```

## Tecnologias

```txt
JavaScript
D3.js
DuckDB WASM
HTML
CSS
Vite
```
